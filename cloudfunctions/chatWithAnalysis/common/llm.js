// ═══════════════════════════════════════════════
// LLM API 调用封装（云函数 CommonJS 版本）
// 使用 Node.js 原生 https 模块，不依赖 fetch
// ═══════════════════════════════════════════════

var https = require('https');
var analysisPrompt = require('./prompts/analysisPrompt');
var chatPrompt = require('./prompts/chatPrompt');

var DEFAULT_PROVIDER = 'deepseek';
var FALLBACK_API_KEY = 'sk-23bd49439b414f57befed541eb8ed185';

function getConfig() {
  var provider = (process.env.LLM_PROVIDER || DEFAULT_PROVIDER);

  var apiKey =
    process.env.LLM_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    FALLBACK_API_KEY;

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
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === 'system') {
        systemMsg = messages[i];
        break;
      }
    }
    var chatMessages = [];
    for (var j = 0; j < messages.length; j++) {
      if (messages[j].role !== 'system') {
        chatMessages.push({ role: messages[j].role, content: messages[j].content });
      }
    }

    var body = {
      model: config.model,
      max_tokens: maxTokens,
      messages: chatMessages,
    };
    if (systemMsg) {
      body.system = systemMsg.content;
    }
    if (stream) {
      body.stream = true;
    }
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

// ── HTTP helpers (https.request, no fetch) ───────────────────────

function httpPost(url, headers, bodyStr, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var urlObj = new URL(url);
    var payload = Buffer.from(bodyStr, 'utf8');

    var options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Length': payload.length,
      }),
    };

    var timer = setTimeout(function () {
      req.destroy();
      reject(new Error('HTTP request timeout after ' + (timeoutMs || 120000) + 'ms'));
    }, timeoutMs || 120000);

    var req = https.request(options, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        clearTimeout(timer);
        var responseText = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, text: function () { return Promise.resolve(responseText); }, json: function () { return Promise.resolve(JSON.parse(responseText)); } });
        } else {
          resolve({ ok: false, status: res.statusCode, text: function () { return Promise.resolve(responseText); }, json: function () { try { return Promise.resolve(JSON.parse(responseText)); } catch (e) { return Promise.resolve({}); } } });
        }
      });
    });

    req.on('error', function (err) {
      clearTimeout(timer);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

function httpPostStream(url, headers, bodyStr, timeoutMs, onChunk) {
  return new Promise(function (resolve, reject) {
    var urlObj = new URL(url);
    var payload = Buffer.from(bodyStr, 'utf8');

    var options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Length': payload.length,
      }),
    };

    var timer = setTimeout(function () {
      req.destroy();
      reject(new Error('HTTP stream timeout after ' + (timeoutMs || 120000) + 'ms'));
    }, timeoutMs || 120000);

    var fullText = '';
    var buffer = '';

    var req = https.request(options, function (res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        var errChunks = [];
        res.on('data', function (c) { errChunks.push(c); });
        res.on('end', function () {
          clearTimeout(timer);
          var errText = Buffer.concat(errChunks).toString('utf8');
          reject(new Error('LLM chat error: ' + res.statusCode + ' ' + errText));
        });
        return;
      }

      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        buffer += chunk;
        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf('data: ') !== 0) continue;
          var data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            var parsed = JSON.parse(data);
            var text = extractStreamDelta(getConfig(), parsed);
            if (text) {
              fullText += text;
              if (onChunk) onChunk(text);
            }
          } catch (_) {}
        }
      });

      res.on('end', function () {
        clearTimeout(timer);
        if (buffer) {
          var line = buffer.trim();
          if (line.indexOf('data: ') === 0) {
            var data = line.slice(6);
            if (data !== '[DONE]') {
              try {
                var parsed = JSON.parse(data);
                var text = extractStreamDelta(getConfig(), parsed);
                if (text) {
                  fullText += text;
                  if (onChunk) onChunk(text);
                }
              } catch (_) {}
            }
          }
        }
        resolve(fullText);
      });
    });

    req.on('error', function (err) {
      clearTimeout(timer);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

// ── CoT progress step definitions ────────────────────────────────

var COT_STEPS = [
  { step: 'understanding', message: '正在理解对话上下文...', progress: 15 },
  { step: 'personality', message: '正在分析性格特质...', progress: 30 },
  { step: 'evidence', message: '正在提取关键证据...', progress: 50 },
  { step: 'emotion', message: '正在分析情绪变化...', progress: 65 },
  { step: 'judging', message: '正在综合判断...', progress: 80 },
  { step: 'strategy', message: '正在制定调解策略...', progress: 92 },
  { step: 'done', message: '分析完成', progress: 100 },
];

// ── Public API ───────────────────────────────────────────────────

async function analyzeChat(formattedChat, parties, caseContext, onProgress) {
  var config = getConfig();
  if (!config.apiKey) {
    throw new Error('Missing API key. Set LLM_API_KEY environment variable.');
  }

  var userPrompt = analysisPrompt.buildAnalysisUserPrompt(formattedChat, parties, caseContext);

  if (onProgress) {
    onProgress(COT_STEPS[0].step, COT_STEPS[0].progress);
  }

  var response = await httpPost(
    buildChatEndpoint(config),
    buildHeaders(config),
    buildRequestBody(config, [{ role: 'user', content: userPrompt }], 8192, false),
    150000
  );

  if (!response.ok) {
    var err = await response.text();
    throw new Error('LLM API error: ' + response.status + ' ' + err);
  }

  if (onProgress) {
    onProgress(COT_STEPS[1].step, COT_STEPS[1].progress);
    onProgress(COT_STEPS[2].step, COT_STEPS[2].progress);
  }

  var data = await response.json();

  if (onProgress) {
    onProgress(COT_STEPS[3].step, COT_STEPS[3].progress);
  }

  var text = extractTextFromResponse(config, data);

  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from LLM response');
  }

  if (onProgress) {
    onProgress(COT_STEPS[4].step, COT_STEPS[4].progress);
  }

  var parsed = JSON.parse(jsonMatch[0]);

  if (onProgress) {
    onProgress(COT_STEPS[5].step, COT_STEPS[5].progress);
    onProgress(COT_STEPS[6].step, COT_STEPS[6].progress);
  }

  return parsed;
}

async function chatWithAnalysis(context, history, newMessage, onChunk) {
  var config = getConfig();

  var systemPrompt = chatPrompt.buildChatSystemPrompt(context);

  var messages = [
    { role: 'system', content: systemPrompt },
  ];
  for (var i = 0; i < history.length; i++) {
    messages.push({
      role: history[i].role,
      content: history[i].content,
    });
  }
  messages.push({ role: 'user', content: newMessage });

  var fullText = await httpPostStream(
    buildChatEndpoint(config),
    buildHeaders(config),
    buildRequestBody(config, messages, 2048, true),
    120000,
    onChunk
  );

  return fullText;
}

module.exports = {
  getConfig: getConfig,
  analyzeChat: analyzeChat,
  chatWithAnalysis: chatWithAnalysis,
  COT_STEPS: COT_STEPS,
};
