var assert = require('assert');
var fs = require('fs');
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
  var analysisSource = fs.readFileSync(path.join(__dirname, '../services/analysis.js'), 'utf8');
  var evidenceSource = fs.readFileSync(path.join(__dirname, '../services/evidence.js'), 'utf8');
  var uploadPageSource = fs.readFileSync(path.join(__dirname, '../pages/upload/upload.js'), 'utf8');
  var uploadMarkup = fs.readFileSync(path.join(__dirname, '../pages/upload/upload.wxml'), 'utf8');
  var reportPageSource = fs.readFileSync(path.join(__dirname, '../pages/report/report.js'), 'utf8');
  var reportPageMarkup = fs.readFileSync(path.join(__dirname, '../pages/report/report.wxml'), 'utf8');
  var homeMarkup = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8');
  var reportMarkup = fs.readFileSync(path.join(__dirname, '../components/core-verdict/core-verdict.wxml'), 'utf8');
  var progressMarkup = fs.readFileSync(path.join(__dirname, '../components/analysis-progress/analysis-progress.wxml'), 'utf8');
  assert.strictEqual(analysisSource.includes("callFunction('analyzeCase'"), false, 'V3 analysis must not fall back to legacy cloud function');
  assert.strictEqual(analysisSource.includes("callFunction('getAnalysis'"), false, 'V3 reads must stay on authenticated CloudRun');
  assert.strictEqual(evidenceSource.includes("callFunction('ocrImage'"), false, 'V3 OCR must not use legacy OCR function');
  assert.strictEqual(evidenceSource.includes("callFunction('ocrBatch'"), false, 'V3 batch OCR must not use legacy OCR function');
  assert.strictEqual(evidenceSource.includes('compressText'), false, 'V3 must preserve original evidence instead of client-side compression');
  assert.strictEqual(uploadPageSource.includes('?.'), false, 'Mini Program upload code must not use unsupported optional chaining');
  assert.strictEqual(homeMarkup.includes('秒出结果'), false, 'V3 home must not promise an unverified instant result');
  assert.strictEqual(homeMarkup.includes('全程匿名'), false, 'V3 home must not make an absolute anonymity claim');
  assert.strictEqual(reportMarkup.includes('仲裁结论'), false, 'V3 report must not frame AI as an arbitrator');
  assert.strictEqual(reportMarkup.includes('更有理'), false, 'V3 report must not lead with winner language');
  assert.ok(reportMarkup.includes('还缺什么'), 'V3 report must expose missing evidence');
  assert.ok(progressMarkup.includes('不展示模型内部思考'), 'Progress UI must distinguish task state from model reasoning');
  assert.ok(uploadMarkup.includes('personality-picker'), 'Upload flow must retain optional MBTI and zodiac input');
  assert.ok(reportPageMarkup.includes('沟通偏好参考'), 'Report must display optional communication preferences');
  assert.ok(reportPageMarkup.includes('不用于判断事实、责任或证据充分度'), 'Preference UI must state its evidence boundary');
  assert.ok(uploadPageSource.includes('updatePersonality'), 'Preferences must save before analysis starts');
  assert.ok(reportPageSource.includes('updatePersonality'), 'Preferences must be editable from the report');

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

  var watched = await new Promise(function (resolve, reject) {
    var timeout = setTimeout(function () { reject(new Error('progress watcher timeout')); }, 1000);
    var watcher = analysis.watchAnalysisProgress('a-1', function (progress) {
      clearTimeout(timeout);
      watcher.close();
      resolve(progress);
    });
  });
  assert.strictEqual(watched.step, 'done');
  assert.strictEqual(calls[5].path, '/api/analyze/a-1');

  var originalCallContainer = global.wx.cloud.callContainer;
  delete global.wx.cloud.callContainer;
  await assert.rejects(
    analysis.analyzeCase('case-1', false, false, { idempotencyKey: 'no-fallback' }),
    /CloudRun未启用或配置不完整/
  );
  global.wx.cloud.callContainer = originalCallContainer;
  console.log('cloudrun analysis transport: passed');
}

run().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
