var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

process.env.LOCAL_MODE = 'true';
var storeDir = path.join(require('node:os').tmpdir(), 'ai-mediator-pipeline-v3-' + process.pid + '-' + Date.now());
process.env.LOCAL_STORE_DIR = storeDir;
var db = require('../services/db');
var pipeline = require('../services/analysisPipeline');

test.after(function () { fs.rmSync(storeDir, { recursive: true, force: true }); });

test('证据不足时规则引擎直接完成报告且不调用LLM', async function () {
  var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
  var caseId = 'v3-rules-case-' + suffix;
  var analysisId = 'v3-rules-analysis-' + suffix;
  var batchId = 'v3-rules-batch-' + suffix;
  var now = new Date().toISOString();
  await db.collection('cases').doc(caseId).set({ data: {
    title: '规则分流测试', mode: 'single', status: 'analyzing', analysisId: analysisId,
    activeAnalysisId: analysisId, analysisLock: true, evidenceRevision: 1, lockedEvidenceRevision: 1,
    party_a: { openid: 'user-a', nickname: '甲方' }, party_b: null,
  } });
  await db.collection('evidence_batches').doc(batchId).set({ data: {
    caseId: caseId, party: 'party_a', revision: 1, status: 'ready',
    parsedMessages: [{ speaker: '我', content: '请帮我看看', timestamp: null, type: 'text' }],
    rawText: '我: 请帮我看看', ocrBlocks: [], createdAt: now,
  } });
  await db.collection('analyses').doc(analysisId).set({ data: {
    caseId: caseId, mode: 'single', deep: false, status: 'running',
    evidenceRevision: 1, lockedEvidenceRevision: 1, evidenceContributors: ['party_a'],
    singlePartyEvidence: true, timings: { queuedAt: now }, createdAt: now,
    job: { attempts: 1, leaseOwner: null, leaseUntil: null },
  } });

  await pipeline.run(analysisId);
  var analysis = (await db.collection('analyses').doc(analysisId).get()).data;
  var caseData = (await db.collection('cases').doc(caseId).get()).data;
  assert.equal(analysis.status, 'completed');
  assert.equal(analysis.llmSkippedReason, 'insufficient');
  assert.equal(analysis.model, 'rules-v3');
  assert.equal(analysis.modelUsage.total_tokens, 0);
  assert.match(analysis.coreConclusion.oneLineVerdict, /证据质量不足/);
  assert.equal(caseData.analysisLock, false);
  assert.equal(caseData.status, 'single_completed');

  await db.collection('analyses').doc(analysisId).remove();
  await db.collection('evidence_batches').doc(batchId).remove();
  await db.collection('cases').doc(caseId).remove();
});
