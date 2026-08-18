var test = require('node:test');
var assert = require('node:assert/strict');

process.env.LOCAL_MODE = 'true';
var db = require('../services/db');
var createWorkflow = require('../services/workflow').createWorkflow;

function validMessages(speaker) {
  return [{ speaker: speaker, content: '用于测试的有效证据', timestamp: '2026-08-18 10:00' }];
}

async function removeDoc(collection, id) {
  await db.collection(collection).doc(id).remove();
}

test('双人任意一方有自己的证据即可启动，分析期间双方证据被锁定', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'dual-lock-' + suffix;
  var workflow = createWorkflow({ db: db, makeId: function () { return 'id-' + Math.random().toString(36).slice(2); } });
  await db.collection('cases').doc(caseId).set({ data: {
    mode: 'dual', status: 'dual_collecting', evidenceRevision: 0, analysisLock: false,
    party_a: { openid: 'a', submitted: false }, party_b: { openid: 'b', submitted: false },
  } });

  var batch = await workflow.appendEvidence({
    caseId: caseId, openid: 'b', rawText: '乙方: 用于测试的有效证据', parsedMessages: validMessages('乙方'),
    idempotencyKey: 'e-b-1',
  });
  assert.equal(batch.batch.party, 'party_b');
  assert.equal(batch.batch.revision, 1);

  var started = await workflow.startAnalysis({ caseId: caseId, openid: 'b', evidenceRevision: 1, idempotencyKey: 'a-1' });
  assert.equal(started.analysis.singlePartyEvidence, true);
  assert.deepEqual(started.analysis.evidenceContributors, ['party_b']);

  var lockedCase = await db.collection('cases').doc(caseId).get();
  assert.equal(lockedCase.data.analysisLock, true);
  assert.equal(lockedCase.data.lockedEvidenceRevision, 1);
  await assert.rejects(
    workflow.appendEvidence({ caseId: caseId, openid: 'a', rawText: '甲方: 新证据', parsedMessages: validMessages('甲方') }),
    function (error) { return error.status === 423 && error.code === 'EVIDENCE_LOCKED'; }
  );

  await workflow.cancelAnalysis({ analysisId: started.analysis._id, openid: 'a' });
  var unlockedCase = await db.collection('cases').doc(caseId).get();
  assert.equal(unlockedCase.data.status, 'dual_collecting');
  assert.equal(unlockedCase.data.analysisLock, false);
  var secondBatch = await workflow.appendEvidence({
    caseId: caseId, openid: 'a', rawText: '甲方: 新证据', parsedMessages: validMessages('甲方'), idempotencyKey: 'e-a-2',
  });
  assert.equal(secondBatch.batch.revision, 2);

  await removeDoc('analyses', started.analysis._id);
  await removeDoc('evidence_batches', batch.batch._id);
  await removeDoc('evidence_batches', secondBatch.batch._id);
  await removeDoc('cases', caseId);
});

test('双方同时启动分析时事务锁只允许一个成功', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'dual-race-' + suffix;
  var counter = 0;
  var workflow = createWorkflow({ db: db, makeId: function () { counter++; return 'race-id-' + suffix + '-' + counter; } });
  await db.collection('cases').doc(caseId).set({ data: {
    mode: 'dual', status: 'dual_collecting', evidenceRevision: 0, analysisLock: false,
    party_a: { openid: 'a' }, party_b: { openid: 'b' },
  } });
  var aBatch = await workflow.appendEvidence({ caseId: caseId, openid: 'a', rawText: '甲方: A', parsedMessages: validMessages('甲方') });
  var bBatch = await workflow.appendEvidence({ caseId: caseId, openid: 'b', rawText: '乙方: B', parsedMessages: validMessages('乙方') });

  var results = await Promise.allSettled([
    workflow.startAnalysis({ caseId: caseId, openid: 'a', evidenceRevision: 2, idempotencyKey: 'start-a' }),
    workflow.startAnalysis({ caseId: caseId, openid: 'b', evidenceRevision: 2, idempotencyKey: 'start-b' }),
  ]);
  assert.equal(results.filter(function (item) { return item.status === 'fulfilled'; }).length, 1);
  var rejected = results.find(function (item) { return item.status === 'rejected'; });
  assert.equal(rejected.reason.code, 'ANALYSIS_IN_PROGRESS');

  var active = results.find(function (item) { return item.status === 'fulfilled'; }).value.analysis;
  await workflow.cancelAnalysis({ analysisId: active._id, openid: 'a' });
  await removeDoc('analyses', active._id);
  await removeDoc('evidence_batches', aBatch.batch._id);
  await removeDoc('evidence_batches', bBatch.batch._id);
  await removeDoc('cases', caseId);
});

test('证据和分析幂等键不会创建重复版本', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'dual-idempotent-' + suffix;
  var workflow = createWorkflow({ db: db });
  await db.collection('cases').doc(caseId).set({ data: {
    mode: 'dual', status: 'dual_collecting', evidenceRevision: 0, analysisLock: false,
    party_a: { openid: 'a' }, party_b: { openid: 'b' },
  } });
  var first = await workflow.appendEvidence({
    caseId: caseId, openid: 'a', rawText: '甲方: A', parsedMessages: validMessages('甲方'), idempotencyKey: 'same-evidence',
  });
  var duplicate = await workflow.appendEvidence({
    caseId: caseId, openid: 'a', rawText: '甲方: A', parsedMessages: validMessages('甲方'), idempotencyKey: 'same-evidence',
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.batch._id, first.batch._id);
  var caseResult = await db.collection('cases').doc(caseId).get();
  assert.equal(caseResult.data.evidenceRevision, 1);

  var analysis = await workflow.startAnalysis({ caseId: caseId, openid: 'a', evidenceRevision: 1, idempotencyKey: 'same-analysis' });
  var analysisDuplicate = await workflow.startAnalysis({ caseId: caseId, openid: 'a', evidenceRevision: 1, idempotencyKey: 'same-analysis' });
  assert.equal(analysisDuplicate.duplicate, true);
  assert.equal(analysisDuplicate.analysis._id, analysis.analysis._id);

  await workflow.cancelAnalysis({ analysisId: analysis.analysis._id, openid: 'b' });
  await removeDoc('analyses', analysis.analysis._id);
  await removeDoc('evidence_batches', first.batch._id);
  await removeDoc('cases', caseId);
});
