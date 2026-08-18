var test = require('node:test');
var assert = require('node:assert/strict');

process.env.LOCAL_MODE = 'true';
var fs = require('node:fs');
var path = require('node:path');
var testStoreDir = path.join(require('node:os').tmpdir(), 'ai-mediator-worker-test-' + process.pid + '-' + Date.now());
process.env.LOCAL_STORE_DIR = testStoreDir;
var db = require('../services/db');
var createWorker = require('../services/analysisWorker').createWorker;

test.after(function () { fs.rmSync(testStoreDir, { recursive: true, force: true }); });

test('worker claims a queued analysis with a durable lease', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'worker-case-' + suffix;
  var analysisId = 'worker-analysis-' + suffix;
  await db.collection('cases').doc(caseId).set({ data: {
    analysisId: analysisId,
    status: 'analyzing',
  } });
  await db.collection('analyses').doc(analysisId).set({ data: {
    caseId: caseId,
    status: 'queued',
    job: { attempts: 0, leaseOwner: null, leaseUntil: null, previousCaseStatus: 'waiting_submission' },
  } });

  var pipeline = {
    run: async function (id) {
      await db.collection('analyses').doc(id).update({ data: { status: 'completed' } });
    },
  };
  var worker = createWorker({ db: db, pipeline: pipeline, workerId: 'test-worker', maxAttempts: 2 });
  await worker.kick();

  var result = await db.collection('analyses').doc(analysisId).get();
  assert.equal(result.data.status, 'completed');
  assert.equal(result.data.job.attempts, 1);
  assert.equal(result.data.job.leaseOwner, 'test-worker');

  await db.collection('analyses').doc(analysisId).remove();
  await db.collection('cases').doc(caseId).remove();
});

test('worker requeues a failed job before the terminal attempt', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'retry-case-' + suffix;
  var analysisId = 'retry-analysis-' + suffix;
  await db.collection('cases').doc(caseId).set({ data: {
    analysisId: analysisId, activeAnalysisId: analysisId, analysisLock: true,
    lockedEvidenceRevision: 1, status: 'analyzing',
  } });
  await db.collection('analyses').doc(analysisId).set({ data: {
    caseId: caseId,
    status: 'queued',
    job: { attempts: 0, leaseOwner: null, leaseUntil: null, previousCaseStatus: 'waiting_submission' },
  } });

  var worker = createWorker({
    db: db,
    pipeline: { run: async function () { throw new Error('temporary'); } },
    workerId: 'retry-worker',
    maxAttempts: 2,
  });
  await worker.kick();
  var result = await db.collection('analyses').doc(analysisId).get();
  assert.equal(result.data.status, 'queued');
  assert.equal(result.data.progress.step, 'retrying');
  assert.equal(result.data.job.attempts, 1);
  assert.equal(result.data.job.leaseOwner, null);

  await db.collection('analyses').doc(analysisId).remove();
  await db.collection('cases').doc(caseId).remove();
});

test('worker restores the previous case status after terminal failure', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'failed-case-' + suffix;
  var analysisId = 'failed-analysis-' + suffix;
  await db.collection('cases').doc(caseId).set({ data: {
    analysisId: analysisId, activeAnalysisId: analysisId, analysisLock: true,
    lockedEvidenceRevision: 1, status: 'analyzing',
  } });
  await db.collection('analyses').doc(analysisId).set({ data: {
    caseId: caseId,
    status: 'queued',
    job: { attempts: 0, leaseOwner: null, leaseUntil: null, previousCaseStatus: 'single_submitted' },
  } });

  var worker = createWorker({
    db: db,
    pipeline: { run: async function () { throw new Error('terminal'); } },
    workerId: 'failed-worker',
    maxAttempts: 1,
  });
  await worker.kick();
  var analysis = await db.collection('analyses').doc(analysisId).get();
  var caseResult = await db.collection('cases').doc(caseId).get();
  assert.equal(analysis.data.status, 'failed');
  assert.equal(caseResult.data.status, 'single_submitted');
  assert.equal(caseResult.data.analysisLock, false);
  assert.equal(caseResult.data.activeAnalysisId, null);

  await db.collection('analyses').doc(analysisId).remove();
  await db.collection('cases').doc(caseId).remove();
});

test('worker terminalizes an expired lease that exhausted all attempts', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'expired-case-' + suffix;
  var analysisId = 'expired-analysis-' + suffix;
  await db.collection('cases').doc(caseId).set({ data: {
    analysisId: analysisId, activeAnalysisId: analysisId, analysisLock: true,
    lockedEvidenceRevision: 1, status: 'analyzing',
  } });
  await db.collection('analyses').doc(analysisId).set({ data: {
    caseId: caseId,
    status: 'running',
    job: {
      attempts: 1,
      leaseOwner: 'dead-worker',
      leaseUntil: new Date(Date.now() - 1000).toISOString(),
      previousCaseStatus: 'waiting_submission',
    },
  } });
  var worker = createWorker({
    db: db,
    pipeline: { run: async function () { throw new Error('must not run'); } },
    workerId: 'recovery-worker',
    maxAttempts: 1,
  });
  await worker.kick();
  var analysis = await db.collection('analyses').doc(analysisId).get();
  var caseResult = await db.collection('cases').doc(caseId).get();
  assert.equal(analysis.data.status, 'failed');
  assert.equal(caseResult.data.status, 'waiting_submission');
  assert.equal(caseResult.data.analysisLock, false);
  await db.collection('analyses').doc(analysisId).remove();
  await db.collection('cases').doc(caseId).remove();
});

test('worker bounds concurrent analysis execution per instance', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var ids = [];
  for (var i = 0; i < 3; i++) {
    var caseId = 'bounded-case-' + i + '-' + suffix;
    var analysisId = 'bounded-analysis-' + i + '-' + suffix;
    ids.push({ caseId: caseId, analysisId: analysisId });
    await db.collection('cases').doc(caseId).set({ data: { analysisId: analysisId, status: 'analyzing' } });
    await db.collection('analyses').doc(analysisId).set({ data: {
      caseId: caseId,
      status: 'queued',
      job: { attempts: 0, leaseOwner: null, leaseUntil: null, previousCaseStatus: 'waiting_submission' },
    } });
  }
  var active = 0;
  var peak = 0;
  var pipeline = {
    run: async function (id) {
      active++;
      peak = Math.max(peak, active);
      await new Promise(function (resolve) { setTimeout(resolve, 5); });
      await db.collection('analyses').doc(id).update({ data: { status: 'completed' } });
      active--;
    },
  };
  var worker = createWorker({ db: db, pipeline: pipeline, workerId: 'bounded-worker', maxConcurrent: 2 });
  await worker.kick();
  assert.equal(peak, 2);
  var completed = 0;
  for (var j = 0; j < ids.length; j++) {
    var result = await db.collection('analyses').doc(ids[j].analysisId).get();
    if (result.data.status === 'completed') completed++;
  }
  assert.equal(completed, 2);
  await worker.kick();
  for (var k = 0; k < ids.length; k++) {
    await db.collection('analyses').doc(ids[k].analysisId).remove();
    await db.collection('cases').doc(ids[k].caseId).remove();
  }
});

test('worker acknowledges cancellation without retrying and unlocks the case', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'cancel-case-' + suffix;
  var analysisId = 'cancel-analysis-' + suffix;
  await db.collection('cases').doc(caseId).set({ data: {
    analysisId: analysisId, activeAnalysisId: analysisId, analysisLock: true,
    lockedEvidenceRevision: 1, status: 'cancel_requested',
    party_a: { openid: 'a' }, party_b: { openid: 'b' },
  } });
  await db.collection('analyses').doc(analysisId).set({ data: {
    caseId: caseId, status: 'cancel_requested', lockedEvidenceRevision: 1,
    job: { attempts: 1, leaseOwner: 'cancel-worker', leaseUntil: new Date(Date.now() + 10000).toISOString() },
  } });
  var worker = createWorker({ db: db, pipeline: {}, workerId: 'cancel-worker' });
  await worker.acknowledgeCanceled({ _id: analysisId });
  var analysis = await db.collection('analyses').doc(analysisId).get();
  var caseResult = await db.collection('cases').doc(caseId).get();
  assert.equal(analysis.data.status, 'canceled');
  assert.equal(caseResult.data.status, 'dual_collecting');
  assert.equal(caseResult.data.analysisLock, false);
  assert.equal(caseResult.data.activeAnalysisId, null);
  await db.collection('analyses').doc(analysisId).remove();
  await db.collection('cases').doc(caseId).remove();
});
