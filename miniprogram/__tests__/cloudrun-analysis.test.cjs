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
      request.success({ statusCode: 200, data: { code: 0, data: { _id: 'a-1', status: 'completed', progress: { step: 'done', progress: 100 } } } });
    },
  },
};

var analysis = require('../services/analysis');

async function run() {
  var started = await analysis.analyzeCase('case-1', true, true);
  assert.strictEqual(started.data.analysisId, 'a-1');
  assert.strictEqual(calls[0].config.env, 'test-env');
  assert.strictEqual(calls[0].header['X-WX-SERVICE'], 'test-service');
  assert.strictEqual(calls[0].path, '/api/analyze/start');
  assert.strictEqual(calls[0].data.force, true);

  var result = await analysis.getAnalysis('a-1');
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(calls[1].path, '/api/analyze/a-1');
  console.log('cloudrun analysis transport: passed');
}

run().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
