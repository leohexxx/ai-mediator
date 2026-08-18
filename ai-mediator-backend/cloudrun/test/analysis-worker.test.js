var test = require('node:test');
var assert = require('node:assert/strict');

process.env.LOCAL_MODE = 'true';
var db = require('../services/db');
var createWorker = require('../services/analysisWorker').createWorker;

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
  await db.collection('cases').doc(caseId).set({ data: { analysisId: analysisId, status: 'analyzing' } });
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
  await db.collection('cases').doc(caseId).set({ data: { analysisId: analysisId, status: 'analyzing' } });
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

  await db.collection('analyses').doc(analysisId).remove();
  await db.collection('cases').doc(caseId).remove();
});
