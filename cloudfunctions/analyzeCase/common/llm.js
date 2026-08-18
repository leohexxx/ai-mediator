// ═══════════════════════════════════════════════
// LLM API 调用封装（云函数 CommonJS 版本）
// 使用 Node.js 原生 https 模块，不依赖 fetch
// v3: 分阶段分析（summarize/core/evidence/strategy），每阶段独立调用、输出受控
// ═══════════════════════════════════════════════

var https = require('https');
var analysisPrompt = require('./prompts/analysisPrompt');
var chatPrompt = require('./prompts/chatPrompt');

var DEFAULT_PROVIDER = 'deepseek';

// ── 多 Key 池（轮询 + 故障切换）────────────────────
// 支持 LLM_API_KEYS（逗号分隔）或 LLM_API_KEY/LLM_API_KEY_2..5 单个 env var
var KEY_POOL = [];
var KEY_INDEX = 0;
var KEY_SKIP = {}; // 当前 invocation 中被跳过（401/403/429）的 key

function buildKeyPool() {
  // 1) 逗号分隔
  var keysStr = process.env.LLM_API_KEYS;
  if (keysStr) {
    KEY_POOL = keysStr.split(',').map(function (k) { return k.trim(); }).filter(function (k) { return k; });
    if (KEY_POOL.length > 0) return;
  }
  // 2) 逐个 env var
  for (var i = 1; i <= 10; i++) {
    var name = i === 1 ? 'LLM_API_KEY' : 'LLM_API_KEY_' + i;
    var k = process.env[name];
    if (k && k.trim()) KEY_POOL.push(k.trim());
  }
  if (KEY_POOL.length === 0) KEY_POOL = ['']; // getConfig 会检查空 key
  // FIXME: 请在生产环境设置 LLM_API_KEY 环境变量，或在此处填入您自己的 DeepSeek API key
  if (KEY_POOL.length === 1 && KEY_POOL[0] === '') {
    var fallback = process.env.FALLBACK_API_KEY;
    if (fallback && fallback.trim()) {
      KEY_POOL = [fallback.trim()];
    }
  }
}

function getNextApiKey() {
  if (KEY_POOL.length === 0) buildKeyPool();
  // 跳过标记为坏的 key，最多循环一轮
  for (var tries = 0; tries < KEY_POOL.length; tries++) {
    var key = KEY_POOL[KEY_INDEX % KEY_POOL.length];
    KEY_INDEX++;
    if (!KEY_SKIP[key]) return key;
  }
  // 全部被跳过 → 重置并返回第一个
  KEY_SKIP = {};
  return KEY_POOL[0];
}

function markKeyBad(key) {
  KEY_SKIP[key] = true;
  console.warn('标记 key 不可用 (***' + (key.slice(-6)) + ')，尝试下一个');
}

// 单阶段 HTTP 超时：云函数上限 60s，留 10s 余量给回传响应前的 DB 操作
var STAGE_TIMEOUT_MS = 50000;

function getConfig() {
  var provider = (process.env.LLM_PROVIDER || DEFAULT_PROVIDER);

  var apiKey = getNextApiKey();

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
    // V4 Flash：单阶段 ~10s，稳定低于云函数 60s 上限；Pro 单阶段 ~45s 会超时
    defaultModel = 'deepseek-v4-flash';
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

// ── JSON 清洗与解析（多级兜底）────────────────────────

function parseJsonResponse(text) {
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from LLM response');
  }

  var rawJson = jsonMatch[0];
  rawJson = rawJson
    .replace(/[\x00-\x1F\x7F]/g, ' ')       // 移除全部控制字符（含 \n \r \t）
    .replace(/\\(?!["\\/bfnrtu])/g, '\\\\'); // 修复非法转义

  try {
    return JSON.parse(rawJson);
  } catch (e1) {
    try {
      var repaired = rawJson
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
        .replace(/"\s+"/g, '", "')
        .replace(/]\s+\[/g, '], [')
        .replace(/}\s+{/g, '}, {')
        .replace(/(\d)\s+"/g, '$1, "')
        .replace(/"\s+(\d)/g, '", $1');
      return JSON.parse(repaired);
    } catch (e2) {
      return extractCoreFields(rawJson);
    }
  }
}

// ── CoT progress step 定义（分阶段版，真实进度）─────────
var COT_STEPS = [
  { step: 'understanding', message: '正在理解对话上下文...', progress: 10 },
  { step: 'summarize', message: '正在压缩长文本...', progress: 18 },
  { step: 'core', message: '正在分析性格与综合判断...', progress: 40 },
  { step: 'evidence', message: '正在提取证据与情绪...', progress: 70 },
  { step: 'strategy', message: '正在制定调解策略...', progress: 90 },
  { step: 'done', message: '分析完成', progress: 100 },
];

// ── 单阶段调用 ───────────────────────────────────

/**
 * 调用单个分析阶段。
 * @param {string} stage - 'summarize' | 'core' | 'evidence' | 'strategy'
 * @param {string} chatText - 该阶段使用的聊天文本（可能是原文或摘要）
 * @param {Array} parties
 * @param {string} caseContext
 * @param {string} [priorContext] - 前序阶段结论的 compact JSON 文本
 * @param {string} [model] - 覆盖该阶段使用的模型（深度模式用 Pro，普通用 Flash）
 * @returns {Promise<Object|string>} summarize 返回 string，其余返回解析后的对象
 */
async function analyzeChatStage(stage, chatText, parties, caseContext, priorContext, model) {
  var config = getConfig();
  if (!config.apiKey) {
    throw new Error('Missing API key. Set LLM_API_KEY environment variable.');
  }
  if (model) config.model = model; // 深度模式按阶段覆盖模型

  var userPrompt = analysisPrompt.buildStageUserPrompt(stage, chatText, parties, caseContext, priorContext);
  var maxTokens = analysisPrompt.getStageMaxTokens(stage);

  var response = await httpPost(
    buildChatEndpoint(config),
    buildHeaders(config),
    buildRequestBody(config, [{ role: 'user', content: userPrompt }], maxTokens, false),
    STAGE_TIMEOUT_MS
  );

  if (!response.ok) {
    var errText = await response.text();
    // 401/403/429 → 标记该 key 不可用（下次调用自动换 key），其他错误直接抛
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      markKeyBad(config.apiKey);
    }
    throw new Error('LLM API error (' + stage + '): ' + response.status + ' ' + errText);
  }

  var data = await response.json();
  var text = extractTextFromResponse(config, data);

  if (stage === 'summarize') return text.trim() || chatText;

  return parseJsonResponse(text);
}

/**
 * 把任意对象压缩成供下一阶段引用的 compact JSON 文本（截断超长字段）。
 */
function compactPrior(obj) {
  try {
    return JSON.stringify(obj).slice(0, 2500);
  } catch (_) {
    return '';
  }
}

/**
 * 合并各阶段产出为最终 v2 schema。
 */
function mergeStages(core, evidence, strategy) {
  var detailed = {
    summary: (core && core.summary) || '',
    relationship: (core && core.relationship) || '',
    characters: (core && core.characters) || [],
    conflicts: (evidence && evidence.conflicts) || [],
    timeline: (evidence && evidence.timeline) || [],
  };

  return {
    coreConclusion: (core && core.coreConclusion) || {},
    evidenceWeights: (evidence && evidence.evidenceWeights) || [],
    emotionCurve: (evidence && evidence.emotionCurve) || [],
    mediationStrategy: (strategy && strategy.mediationStrategy) || [],
    detailedAnalysis: detailed,
    advice: (strategy && strategy.advice) || { toA: [], toB: [], toBoth: [] },
  };
}

/**
 * 完整分析（顺序跑各阶段）。供测试与兼容入口使用。
 * 云函数实际运行时由 analyzeCase 逐阶段自调用，不会一次跑完。
 */
async function analyzeChat(formattedChat, parties, caseContext, onProgress) {
  var chatText = formattedChat;

  // 长文本先摘要
  if (formattedChat.length > analysisPrompt.SUMMARIZE_THRESHOLD) {
    if (onProgress) onProgress(COT_STEPS[1].step, COT_STEPS[1].progress);
    try {
      chatText = await analyzeChatStage('summarize', formattedChat, parties, caseContext);
    } catch (e) {
      // 摘要失败则退回原文（截断到阈值内保安全）
      chatText = formattedChat.slice(0, analysisPrompt.SUMMARIZE_THRESHOLD * 2);
    }
  }

  if (onProgress) onProgress(COT_STEPS[0].step, COT_STEPS[0].progress);

  // 第一阶段：核心
  if (onProgress) onProgress(COT_STEPS[2].step, COT_STEPS[2].progress);
  var core = await analyzeChatStage('core', chatText, parties, caseContext);

  // 第二阶段：证据（携带第一阶段结论）
  if (onProgress) onProgress(COT_STEPS[3].step, COT_STEPS[3].progress);
  var evidence = await analyzeChatStage('evidence', chatText, parties, caseContext, compactPrior(core));

  // 第三阶段：策略（携带前两阶段结论）
  if (onProgress) onProgress(COT_STEPS[4].step, COT_STEPS[4].progress);
  var strategy = await analyzeChatStage('strategy', chatText, parties, caseContext,
    compactPrior({ core: core, evidence: { evidenceWeights: evidence.evidenceWeights, emotionCurve: evidence.emotionCurve } }));

  if (onProgress) onProgress(COT_STEPS[5].step, COT_STEPS[5].progress);

  return mergeStages(core, evidence, strategy);
}

// ── 终极兜底：正则提取核心字段 ──────────────────────

function extractCoreFields(rawText) {
  function getStr(key) {
    var m = rawText.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
    return m ? m[1] : '';
  }
  function getNum(key) {
    var m = rawText.match(new RegExp('"' + key + '"\\s*:\\s*(\\d+)'));
    return m ? parseInt(m[1], 10) : 0;
  }
  function getArr(key) {
    var arr = [];
    var re = new RegExp('"' + key + '"\\s*:\\s*\\[([\\s\\S]*?)\\]', 'm');
    var m = rawText.match(re);
    if (m) {
      var items = m[1].match(/"([^"]*)"/g);
      if (items) arr = items.map(function (s) { return s.replace(/^"|"$/g, ''); });
    }
    return arr;
  }

  return {
    coreConclusion: {
      overallWinner: getStr('overallWinner') || 'tie',
      scoreA: getNum('scoreA') || 50,
      scoreB: getNum('scoreB') || 50,
      oneLineVerdict: getStr('oneLineVerdict') || '（JSON解析异常，已降级提取核心字段）',
      keyReasons: getArr('keyReasons'),
      recommendedAction: getStr('recommendedAction') || '',
      confidence: getNum('confidence') || 60,
      confidenceReasons: getArr('confidenceReasons'),
    },
    evidenceWeights: [],
    emotionCurve: [],
    mediationStrategy: [],
    detailedAnalysis: {
      summary: getStr('summary') || '（降级提取）',
      relationship: getStr('relationship') || '',
      characters: [],
      conflicts: [],
      timeline: [],
    },
    advice: {
      toA: getArr('toA'),
      toB: getArr('toB'),
      toBoth: getArr('toBoth'),
    },
  };
}

async function chatWithAnalysis(context, history, newMessage, onChunk, safetyShown) {
  var config = getConfig();

  var systemPrompt = chatPrompt.buildChatSystemPrompt(context, safetyShown);

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

/**
 * 压缩文本 — 提取关键信息
 * @param {string} text - 原文
 * @returns {Promise<string>} 压缩后的文本
 */
async function compressText(text) {
  var config = getConfig();
  if (!config.apiKey) {
    throw new Error('Missing API key. Set LLM_API_KEY environment variable.');
  }

  var userPrompt = chatPrompt.buildCompressUserPrompt(text);
  var maxTokens = 4096;

  var response = await httpPost(
    buildChatEndpoint(config),
    buildHeaders(config),
    buildRequestBody(config, [{ role: 'user', content: userPrompt }], maxTokens, false),
    60000
  );

  if (!response.ok) {
    var errText = await response.text();
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      markKeyBad(config.apiKey);
    }
    throw new Error('compressText LLM error: ' + response.status + ' ' + errText);
  }

  var data = await response.json();
  var text2 = extractTextFromResponse(config, data);
  return text2.trim() || text; // 如果返回空，退回原文
}

module.exports = {
  getConfig: getConfig,
  analyzeChat: analyzeChat,
  analyzeChatStage: analyzeChatStage,
  mergeStages: mergeStages,
  compactPrior: compactPrior,
  chatWithAnalysis: chatWithAnalysis,
  compressText: compressText,  // ← 新增
  COT_STEPS: COT_STEPS,
  STAGE_TIMEOUT_MS: STAGE_TIMEOUT_MS,
};
