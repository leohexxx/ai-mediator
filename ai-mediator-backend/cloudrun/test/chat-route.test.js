var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');

process.env.LOCAL_MODE = 'true';
process.env.PORT = '0';
process.env.LLM_API_KEYS = 'test-key';
var testStoreDir = path.join(os.tmpdir(), 'ai-mediator-chat-test-' + process.pid + '-' + Date.now());
process.env.LOCAL_STORE_DIR = testStoreDir;

var llm = require('../services/llm');
llm.chatCompletion = function (systemPrompt, messages, maxTokens, model, options) {
  var latest = messages[messages.length - 1].content;
  if (latest !== '等待取消') return Promise.resolve('服务端回答：' + latest);
  return new Promise(function (resolve, reject) {
    options.signal.addEventListener('abort', function () {
      var error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
};

var db = require('../services/db');
var runtime = require('../server');
var server = runtime.server;
var baseUrl;
var suffix = Date.now() + '-' + Math.random().toString(36).slice(2);
var caseId = 'chat-case-' + suffix;
var analysisId = 'chat-analysis-' + suffix;

test.before(async function () {
  if (!server.listening) await new Promise(function (resolve) { server.once('listening', resolve); });
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  await db.collection('cases').doc(caseId).set({ data: {
    party_a: { openid: 'chat-a' }, party_b: { openid: 'chat-b' }, status: 'completed', analysisId: analysisId,
  } });
  await db.collection('analyses').doc(analysisId).set({ data: {
    caseId: caseId, status: 'completed', coreConclusion: { oneLineVerdict: 'test' }, evidenceRevision: 1,
  } });
});

test.after(async function () {
  runtime.analysisWorker.stop();
  await new Promise(function (resolve) {
    server.close(resolve);
    if (server.closeAllConnections) server.closeAllConnections();
  });
  var messages = await db.collection('conversation_messages').where({ caseId: caseId }).get();
  var jobs = await db.collection('chat_jobs').where({ caseId: caseId }).get();
  for (var i = 0; i < messages.data.length; i++) await db.collection('conversation_messages').doc(messages.data[i]._id).remove();
  for (var j = 0; j < jobs.data.length; j++) await db.collection('chat_jobs').doc(jobs.data[j]._id).remove();
  await db.collection('analyses').doc(analysisId).remove();
  await db.collection('cases').doc(caseId).remove();
  fs.rmSync(testStoreDir, { recursive: true, force: true });
});

function request(path, options, openid) {
  options = options || {};
  options.headers = Object.assign({ 'content-type': 'application/json', 'x-mock-openid': openid || 'chat-a' }, options.headers || {});
  return fetch(baseUrl + path, options);
}

test('双方共享追问由服务端持久化且非参与者不可读取', async function () {
  var response = await request('/api/chat/messages', { method: 'POST', body: JSON.stringify({
    caseId: caseId, analysisId: analysisId, message: '证据怎么看', jobId: 'chat-job-' + suffix,
  }) });
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.data.reply, '服务端回答：证据怎么看');

  var historyResponse = await request('/api/chat/case/' + caseId + '/messages', { method: 'GET' }, 'chat-b');
  var history = await historyResponse.json();
  assert.equal(history.data.messages.length, 2);
  assert.deepEqual(history.data.messages.map(function (item) { return item.role; }), ['user', 'assistant']);

  var forbidden = await request('/api/chat/case/' + caseId + '/messages', { method: 'GET' }, 'outsider');
  assert.equal(forbidden.status, 403);
});

test('任意参与方可以打断正在生成的追问', async function () {
  var jobId = 'cancel-chat-' + suffix;
  var pending = request('/api/chat/messages', { method: 'POST', body: JSON.stringify({
    caseId: caseId, analysisId: analysisId, message: '等待取消', jobId: jobId,
  }) });
  for (var i = 0; i < 50; i++) {
    var current = await db.collection('chat_jobs').doc(jobId).get();
    if (current.data) break;
    await new Promise(function (resolve) { setTimeout(resolve, 5); });
  }
  var cancelResponse = await request('/api/chat/' + jobId + '/cancel', { method: 'POST', body: '{}' }, 'chat-b');
  assert.equal(cancelResponse.status, 202);
  var result = await (await pending).json();
  assert.equal(result.data.status, 'canceled');
  var job = await db.collection('chat_jobs').doc(jobId).get();
  assert.equal(job.data.status, 'canceled');
});
