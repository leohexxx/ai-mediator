var assert = require('assert');
var path = require('path');

var config = require('../config/cloudrun');
config.enabled = true;
config.env = 'test-env';
config.serviceName = 'test-service';

var calls = [];
global.wx = {
  cloud: {
    callContainer: function (request) {
      calls.push(request);
      if (request.path === '/api/analyze/start') {
        request.success({ statusCode: 202, data: { code: 0, data: { analysisId: 'a-1', status: 'queued' } } });
        return;
      }
      if (request.path === '/api/analyze/a-1/cancel') {
        request.success({ statusCode: 202, data: { code: 0, data: { analysisId: 'a-1', status: 'cancel_requested' } } });
        return;
      }
      if (request.path === '/api/evidence/batches') {
        request.success({ statusCode: 201, data: { code: 0, data: { batchId: 'b-1', revision: 2 } } });
        return;
      }
      if (request.path === '/api/chat/messages') {
        request.success({ statusCode: 200, data: { code: 0, data: { jobId: 'j-1', reply: 'reply' } } });
        return;
      }
      request.success({ statusCode: 200, data: { code: 0, data: { _id: 'a-1', status: 'completed', progress: { step: 'done', progress: 100 } } } });
    },
  },
};

var analysis = require('../services/analysis');
var evidence = require('../services/evidence');
var chat = require('../services/chat');

async function run() {
  var started = await analysis.analyzeCase('case-1', true, true, { evidenceRevision: 2, idempotencyKey: 'start-1' });
  assert.strictEqual(started.data.analysisId, 'a-1');
  assert.strictEqual(calls[0].config.env, 'test-env');
  assert.strictEqual(calls[0].header['X-WX-SERVICE'], 'test-service');
  assert.strictEqual(calls[0].path, '/api/analyze/start');
  assert.strictEqual(calls[0].data.force, undefined);
  assert.strictEqual(calls[0].data.evidenceRevision, 2);

  var result = await analysis.getAnalysis('a-1');
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(calls[1].path, '/api/analyze/a-1');

  var canceled = await analysis.cancelAnalysis('a-1');
  assert.strictEqual(canceled.data.status, 'cancel_requested');
  assert.strictEqual(calls[2].path, '/api/analyze/a-1/cancel');

  var batch = await evidence.uploadEvidence({ caseId: 'case-1', rawText: '甲: 证据', idempotencyKey: 'e-1' });
  assert.strictEqual(batch.data.revision, 2);
  assert.strictEqual(calls[3].path, '/api/evidence/batches');

  var reply = await chat.sendMessage({ caseId: 'case-1', analysisId: 'a-1', message: '继续问', jobId: 'j-1' });
  assert.strictEqual(reply.data.reply, 'reply');
  assert.strictEqual(calls[4].path, '/api/chat/messages');
  console.log('cloudrun analysis transport: passed');
}

run().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
