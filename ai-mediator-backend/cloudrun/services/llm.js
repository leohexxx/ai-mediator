// LLM service: credential rotation, bounded retries and usage metadata.
// Prompts and generated user content are intentionally never logged.
var https = require('https');
var config = require('../config');
var metrics = require('./metrics');

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
  if (key) KEY_SKIP[key] = true;
  console.warn('[LLM] one credential slot was temporarily disabled');
}

function responseError(statusCode, text, headers) {
  var error = new Error('LLM API ' + statusCode + ' request failed');
  error.statusCode = statusCode;
  error.code = 'LLM_HTTP_ERROR';
  error.retryAfter = headers && Number(headers['retry-after']) || 0;
  error.providerMessage = String(text || '').substring(0, 160);
  return error;
}

function httpPost(url, headers, bodyStr, timeoutMs, callOptions) {
  callOptions = callOptions || {};
  return new Promise(function (resolve, reject) {
    var urlObj = new URL(url);
    var payload = Buffer.from(bodyStr, 'utf8');
    var settled = false;
    var requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: Object.assign({}, headers, { 'Content-Length': payload.length }),
    };
    var req = https.request(requestOptions, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        var text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(text));
          } catch (parseError) {
            var invalid = new Error('LLM API returned invalid JSON envelope');
            invalid.code = 'LLM_INVALID_ENVELOPE';
            reject(invalid);
          }
          return;
        }
        reject(responseError(res.statusCode, text, res.headers));
      });
    });
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      var timeoutError = new Error('LLM request timed out');
      timeoutError.code = 'LLM_TIMEOUT';
      req.destroy(timeoutError);
      reject(timeoutError);
    }, timeoutMs || 120000);
    req.on('error', function (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    if (callOptions.signal) {
      var abortRequest = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        var abortError = new Error('LLM request canceled');
        abortError.name = 'AbortError';
        abortError.code = 'ABORT_ERR';
        req.destroy(abortError);
        reject(abortError);
      };
      if (callOptions.signal.aborted) abortRequest();
      else callOptions.signal.addEventListener('abort', abortRequest, { once: true });
    }
    if (!settled) {
      req.write(payload);
      req.end();
    }
  });
}

function wait(milliseconds, signal) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(resolve, milliseconds);
    if (signal) signal.addEventListener('abort', function () {
      clearTimeout(timer);
      var error = new Error('LLM request canceled');
      error.name = 'AbortError';
      error.code = 'ABORT_ERR';
      reject(error);
    }, { once: true });
  });
}

function isTransient(error) {
  if (!error || error.name === 'AbortError' || error.code === 'ABORT_ERR') return false;
  if (error.code === 'LLM_TIMEOUT' || error.code === 'LLM_INVALID_ENVELOPE') return true;
  if (error.statusCode === 408 || error.statusCode === 429) return true;
  if (error.statusCode >= 500) return true;
  return ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT'].indexOf(error.code) !== -1;
}

async function chatCompletionDetailed(systemPrompt, messages, maxTokens, model, options) {
  options = options || {};
  var endpoint = config.llm.baseUrl + '/chat/completions';
  var chatMessages = [];
  if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });
  for (var i = 0; i < messages.length; i++) chatMessages.push(messages[i]);
  var selectedModel = model || config.llm.model;
  var maxRetries = options.maxRetries == null ? 2 : Math.max(0, Number(options.maxRetries));
  var startedAt = Date.now();
  var lastError = null;

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    var key = getNextKey();
    if (!key) throw new Error('No LLM API keys configured');
    var body = JSON.stringify({
      model: selectedModel,
      max_tokens: maxTokens || 4096,
      messages: chatMessages,
      temperature: options.temperature == null ? 0.2 : options.temperature,
    });
    try {
      var data = await httpPost(endpoint,
        { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body, options.timeoutMs || 120000, { signal: options.signal });
      var text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
      metrics.increment('llm_requests_completed');
      metrics.increment('llm_tokens_total', data.usage && data.usage.total_tokens || 0);
      metrics.observe('llm_latency', Date.now() - startedAt);
      return {
        text: text,
        usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        model: data.model || selectedModel,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      if (error && (error.statusCode === 401 || error.statusCode === 403)) markKeyBad(key);
      if (!isTransient(error) || attempt >= maxRetries) break;
      metrics.increment('llm_requests_retried');
      var retryDelay = error.retryAfter ? error.retryAfter * 1000 : Math.min(400 * Math.pow(2, attempt) + Math.floor(Math.random() * 250), 4000);
      await wait(retryDelay, options.signal);
    }
  }

  metrics.increment(lastError && (lastError.name === 'AbortError' || lastError.code === 'ABORT_ERR') ? 'llm_requests_canceled' : 'llm_requests_failed');
  metrics.observe('llm_latency', Date.now() - startedAt);
  throw lastError;
}

async function chatCompletion(systemPrompt, messages, maxTokens, model, options) {
  var result = await chatCompletionDetailed(systemPrompt, messages, maxTokens, model, options);
  return result.text;
}

module.exports = {
  chatCompletion: chatCompletion,
  chatCompletionDetailed: chatCompletionDetailed,
  getNextKey: getNextKey,
  markKeyBad: markKeyBad,
  isTransient: isTransient,
};
