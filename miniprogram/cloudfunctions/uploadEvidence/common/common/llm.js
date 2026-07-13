// ═══════════════════════════════════════════════
// LLM API 调用封装（云函数 CommonJS 版本）
// 使用 https 模块替代 fetch（微信云函数不支持 fetch）
// ═══════════════════════════════════════════════

var https = require('https');
var url = require('url');
var analysisPrompt = require('./prompts/analysisPrompt');
var chatPrompt = require('./prompts/chatPrompt');

/**
 * 获取 LLM 配置。
 */
function getConfig() {
  var provider = (process.env.LLM_PROVIDER || 'deepseek');

  var DEFAULT_API_KEY = 'sk-23bd49439b414f57befed541eb8ed185';

  var apiKey =
    process.env.LLM_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    DEFAULT_API_KEY;

  var defaultBaseUrl;
  if (provider === 'anthropic') {
    defaultBaseUrl = 'https://api.anthropic.com/v1';
  } else if (provider === 'deepseek') {
    defaultBaseUrl = 'https://api.deepseek.com/v1';
  } else {
    defaultBaseUrl = 'https://api.openai.com/v1';
  }

  var defaultModel;
  if (provider === 'anthropic') {
    defaultModel = 'claude-sonnet-4-20250514';
  } else if (provider === 'deepseek') {
    defaultModel = 'deepseek-chat';
  } else {
    defaultModel = 'gpt-4o';
  }

  return {
    provider: provider,
    apiKey: apiKey,
    model: process.env.LLM_MODEL || defaultModel,
    baseUrl: process.env.LLM_BASE_URL || defaultBaseUrl,
  };
}

// ── HTTP 请求封装（替代 fetch）─────────────────────────────────

/**
 * 发送 HTTPS POST 请求（非流式）
 * @param {string} apiUrl - 完整 URL
 * @param {Object} headers - 请求头
 * @param {string} bodyStr - 请求体字符串
 * @param {number} [timeoutMs=55000]
 * @returns {Promise<{statusCode: number, body: string}>}
 */
function httpPost(apiUrl, headers, bodyStr, timeoutMs) {
  timeoutMs = timeoutMs || 120000;
  return new Promise(function (resolve, reject) {
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      reject(new Error('请求超时 (' + (timeoutMs / 1000) + 's)'));
    }, timeoutMs);

    var parsedUrl = url.parse(apiUrl);
    var options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
      }),
    };

    var req = https.request(options, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        if (timedOut) return;
        clearTimeout(timer);
        var body = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, body: body });
      });
    });

    req.on('error', function (err) {
      if (timedOut) return;
      clearTimeout(timer);
      reject(err);
    });

    req.write(bodyStr);
    req.end();
  });
}

/**
 * 发送 HTTPS POST 请求（流式 SSE）
 * @param {string} apiUrl - 完整 URL
 * @param {Object} headers - 请求头
 * @param {string} bodyStr - 请求体字符串
 * @param {function(string): void} onChunk - 每行 SSE data 回调
 * @param {number} [timeoutMs=55000]
 * @returns {Promise<void>}
 */
function httpPostStream(apiUrl, headers, bodyStr, onChunk, timeoutMs) {
  timeoutMs = timeoutMs || 120000;
  return new Promise(function (resolve, reject) {
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      reject(new Error('流式请求超时 (' + (timeoutMs / 1000) + 's)'));
    }, timeoutMs);

    var parsedUrl = url.parse(apiUrl);
    var options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
      }),
    };

    var req = https.request(options, function (res) {
      if (res.statusCode !== 200) {
        var errChunks = [];
        res.on('data', function (c) { errChunks.push(c); });
        res.on('end', function () {
          reject(new Error('LLM chat error: ' + res.statusCode + ' ' + Buffer.concat(errChunks).toString('utf8')));
        });
        return;
      }

      var buffer = '';
      res.on('data', function (chunk) {
        buffer += chunk.toString('utf8');
        var lines = buffer.split('\n');
        buffer = lines.pop(); // 保留最后不完整的行

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.startsWith('data: ')) {
            onChunk(line.slice(6));
          }
        }
      });
      res.on('end', function () {
        // 处理剩余 buffer
        if (buffer.trim().startsWith('data: ')) {
          onChunk(buffer.trim().slice(6));
        }
        if (!timedOut) clearTimeout(timer);
        resolve();
      });
    });

    req.on('error', function (err) {
      if (timedOut) return;
      clearTimeout(timer);
      reject(err);
    });

    req.write(bodyStr);
    req.end();
  });
}

// ── 请求构建 helpers ─────────────────────────────────────────────

function buildHeaders(config) {
  if (config.provider === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + config.apiKey,
  };
}

function buildChatEndpoint(config) {
  if (config.provider === 'anthropic') {
    return config.baseUrl + '/messages';
  }
  return config.baseUrl + '/chat/completions';
}

function buildRequestBody(config, messages, maxTokens, stream) {
  if (config.provider === 'anthropic') {
    var systemMsg = null;
    var chatMessages = [];
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === 'system') {
        systemMsg = messages[i];
      } else {
        chatMessages.push({ role: messages[i].role, content: messages[i].content });
      }
    }
    var body = { model: config.model, max_tokens: maxTokens, messages: chatMessages };
    if (systemMsg) { body.system = systemMsg.content; }
    if (stream) { body.stream = true; }
    return JSON.stringify(body);
  }
  return JSON.stringify({
    model: config.model,
    max_tokens: maxTokens,
    messages: messages,
    stream: stream,
  });
}

function extractTextFromResponse(config, data) {
  if (config.provider === 'anthropic') {
    var content = data.content;
    var rawText = content && content[0] ? content[0].text : '';
    return typeof rawText === 'string' ? rawText : rawText != null ? String(rawText) : '';
  }
  var choices = data.choices;
  var rawText2 = choices && choices[0] && choices[0].message ? choices[0].message.content : '';
  return typeof rawText2 === 'string' ? rawText2 : rawText2 != null ? String(rawText2) : '';
}

function extractStreamDelta(config, parsed) {
  if (config.provider === 'anthropic') {
    if (parsed.type === 'content_block_delta') {
      return (parsed.delta && parsed.delta.text) || '';
    }
    return '';
  }
  var deltaContent = parsed.choices && parsed.choices[0] && parsed.choices[0].delta
    ? parsed.choices[0].delta.content
    : '';
  return deltaContent || '';
}

// ── CoT progress steps ───────────────────────────────────────────

var COT_STEPS = [
  { step: 'understanding', message: '正在理解对话上下文...', progress: 20 },
  { step: 'evidence', message: '正在提取关键证据...', progress: 40 },
  { step: 'emotion', message: '正在分析情绪变化...', progress: 55 },
  { step: 'judging', message: '正在综合判断...', progress: 75 },
  { step: 'strategy', message: '正在制定调解策略...', progress: 90 },
  { step: 'done', message: '分析完成', progress: 100 },
];

// ── Public API ───────────────────────────────────────────────────

/**
 * 分析聊天记录，返回 v2 分层 Analysis 结构。
 */
async function analyzeChat(formattedChat, parties, caseContext, onProgress) {
  var config = getConfig();
  if (!config.apiKey) {
    throw new Error('Missing API key. Set LLM_API_KEY environment variable.');
  }

  var userPrompt = analysisPrompt.buildAnalysisUserPrompt(formattedChat, parties, caseContext);

  if (onProgress) { onProgress(COT_STEPS[0].step, COT_STEPS[0].progress); }

  var endpoint = buildChatEndpoint(config);
  var headers = buildHeaders(config);
  var bodyStr = buildRequestBody(config, [{ role: 'user', content: userPrompt }], 8192, false);

  var res = await httpPost(endpoint, headers, bodyStr, 120000);

  if (res.statusCode !== 200) {
    throw new Error('LLM API error: ' + res.statusCode + ' ' + res.body.substring(0, 500));
  }

  if (onProgress) {
    onProgress(COT_STEPS[1].step, COT_STEPS[1].progress);
    onProgress(COT_STEPS[2].step, COT_STEPS[2].progress);
  }

  var data;
  try {
    data = JSON.parse(res.body);
  } catch (e) {
    throw new Error('LLM 返回 JSON 解析失败: ' + res.body.substring(0, 200));
  }

  if (onProgress) { onProgress(COT_STEPS[3].step, COT_STEPS[3].progress); }

  var text = extractTextFromResponse(config, data);

  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from LLM response: ' + text.substring(0, 200));
  }

  if (onProgress) { onProgress(COT_STEPS[4].step, COT_STEPS[4].progress); }

  var parsed = JSON.parse(jsonMatch[0]);

  if (onProgress) { onProgress(COT_STEPS[5].step, COT_STEPS[5].progress); }

  return parsed;
}

/**
 * 基于已有分析报告的追问（流式输出）。
 */
async function chatWithAnalysis(context, history, newMessage, onChunk) {
  var config = getConfig();

  var systemPrompt = chatPrompt.buildChatSystemPrompt(context);

  var messages = [{ role: 'system', content: systemPrompt }];
  for (var i = 0; i < history.length; i++) {
    messages.push({ role: history[i].role, content: history[i].content });
  }
  messages.push({ role: 'user', content: newMessage });

  var endpoint = buildChatEndpoint(config);
  var headers = buildHeaders(config);
  var bodyStr = buildRequestBody(config, messages, 2048, true);

  var fullText = '';

  await httpPostStream(endpoint, headers, bodyStr, function (dataLine) {
    if (dataLine === '[DONE]') return;
    try {
      var parsed = JSON.parse(dataLine);
      var text = extractStreamDelta(config, parsed);
      if (text) {
        fullText += text;
        if (onChunk) { onChunk(text); }
      }
    } catch (_) {
      // skip unparseable chunks
    }
  });

  return fullText;
}

module.exports = {
  getConfig: getConfig,
  analyzeChat: analyzeChat,
  chatWithAnalysis: chatWithAnalysis,
  COT_STEPS: COT_STEPS,
};
