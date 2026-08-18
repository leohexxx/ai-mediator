// ═══════════════════════════════════════════════
// LLM 服务 — 调用 DeepSeek / 混元 API
// 支持多 key 轮询 + 故障切换
// ═══════════════════════════════════════════════
var https = require('https');
var config = require('../config');

// Key 池（模块级，进程内轮询）
var KEY_INDEX = 0;
var KEY_SKIP = {};

function getNextKey() {
  var keys = config.llm.apiKeys;
  if (keys.length === 0) return '';
  for (var tries = 0; tries < keys.length; tries++) {
    var key = keys[KEY_INDEX % keys.length];
    KEY_INDEX++;
    if (!KEY_SKIP[key]) return key;
  }
  KEY_SKIP = {};
  return keys[0];
}

function markKeyBad(key) {
  KEY_SKIP[key] = true;
  console.warn('[LLM] key marked bad: ***' + key.slice(-6));
}

/**
 * 发送 HTTP POST 请求
 */
function httpPost(url, headers, bodyStr, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var urlObj = new URL(url);
    var payload = Buffer.from(bodyStr, 'utf8');
    var options = {
      hostname: urlObj.hostname, port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search, method: 'POST',
      headers: Object.assign({}, headers, { 'Content-Length': payload.length }),
    };
    var timer = setTimeout(function () { req.destroy(); reject(new Error('HTTP timeout after ' + timeoutMs + 'ms')); }, timeoutMs || 120000);
    var req = https.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        clearTimeout(timer);
        var text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(text)); } catch (e) { reject(new Error('Invalid JSON response')); }
        } else {
          if (res.statusCode === 401 || res.statusCode === 429) markKeyBad(key);
          reject(new Error('LLM API ' + res.statusCode + ': ' + text.substring(0, 200)));
        }
      });
    });
    req.on('error', function (err) { clearTimeout(timer); reject(err); });
    req.write(payload); req.end();
  });
}

/**
 * 调用 LLM 一次（单轮生成长文本）
 * @param {string} systemPrompt - 系统提示
 * @param {Array} messages - 对话历史
 * @param {number} maxTokens - 最大输出 token
 * @param {string} [model] - 模型覆盖
 * @returns {Promise<string>} 生成文本
 */
async function chatCompletion(systemPrompt, messages, maxTokens, model) {
  var key = getNextKey();
  if (!key) throw new Error('No LLM API keys configured');

  var endpoint = config.llm.baseUrl + '/chat/completions';
  var chatMessages = [];
  if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });
  for (var i = 0; i < messages.length; i++) chatMessages.push(messages[i]);

  var body = JSON.stringify({
    model: model || config.llm.model,
    max_tokens: maxTokens || 4096,
    messages: chatMessages,
    temperature: 0.7,
  });

  var data = await httpPost(endpoint,
    { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body, 120000);

  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

module.exports = {
  chatCompletion: chatCompletion,
  getNextKey: getNextKey,
  markKeyBad: markKeyBad,
};
