// ═══════════════════════════════════════════════
// LLM API 调用封装（云函数 CommonJS 版本）
// 来源: server/src/services/llm.ts
// ═══════════════════════════════════════════════

var analysisPrompt = require('./prompts/analysisPrompt');
var chatPrompt = require('./prompts/chatPrompt');

/**
 * @typedef {'anthropic'|'deepseek'|'openai'} LLMProvider
 */

/**
 * @typedef {Object} LLMConfig
 * @property {LLMProvider} provider
 * @property {string} apiKey
 * @property {string} model
 * @property {string} baseUrl
 */

/**
 * 获取 LLM 配置。
 * 优先从云函数环境变量读取，支持 process.env。
 *
 * @returns {LLMConfig}
 */
function getConfig() {
  var provider = (process.env.LLM_PROVIDER || 'deepseek');

  // 默认 DeepSeek API Key (可通过环境变量 LLM_API_KEY 覆盖)
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

// ── API call helpers ─────────────────────────────────────────────

/**
 * 构建请求头
 * @param {LLMConfig} config
 * @returns {Record<string, string>}
 */
function buildHeaders(config) {
  if (config.provider === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }
  // OpenAI-compatible (DeepSeek, OpenAI, etc.)
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + config.apiKey,
  };
}

/**
 * 获取 Chat API 端点 URL
 * @param {LLMConfig} config
 * @returns {string}
 */
function buildChatEndpoint(config) {
  if (config.provider === 'anthropic') {
    return config.baseUrl + '/messages';
  }
  return config.baseUrl + '/chat/completions';
}

/**
 * 构建请求体
 * @param {LLMConfig} config
 * @param {{role: string, content: string}[]} messages
 * @param {number} maxTokens
 * @param {boolean} stream
 * @returns {string} JSON 字符串
 */
function buildRequestBody(config, messages, maxTokens, stream) {
  if (config.provider === 'anthropic') {
    // Extract system message if present
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

  // OpenAI-compatible format
  return JSON.stringify({
    model: config.model,
    max_tokens: maxTokens,
    messages: messages,
    stream: stream,
  });
}

/**
 * 从非流式响应中提取文本
 * @param {LLMConfig} config
 * @param {Object} data
 * @returns {string}
 */
function extractTextFromResponse(config, data) {
  if (config.provider === 'anthropic') {
    var content = data.content;
    var rawText = content && content[0] ? content[0].text : '';
    return typeof rawText === 'string' ? rawText : rawText != null ? String(rawText) : '';
  }
  // OpenAI-compatible
  var choices = data.choices;
  var rawText2 = choices && choices[0] && choices[0].message ? choices[0].message.content : '';
  return typeof rawText2 === 'string' ? rawText2 : rawText2 != null ? String(rawText2) : '';
}

/**
 * 从流式 SSE delta 中提取文本片段
 * @param {LLMConfig} config
 * @param {Object} parsed
 * @returns {string}
 */
function extractStreamDelta(config, parsed) {
  if (config.provider === 'anthropic') {
    if (parsed.type === 'content_block_delta') {
      return (parsed.delta && parsed.delta.text) || '';
    }
    return '';
  }
  // OpenAI-compatible
  var deltaContent = parsed.choices && parsed.choices[0] && parsed.choices[0].delta
    ? parsed.choices[0].delta.content
    : '';
  return deltaContent || '';
}

// ── CoT progress step definitions ────────────────────────────────

/**
 * @typedef {Object} CoTStep
 * @property {string} step
 * @property {string} message
 * @property {number} progress
 */

/** @type {CoTStep[]} */
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
 *
 * @param {string} formattedChat - 格式化后的聊天记录
 * @param {{name: string, role: string}[]} parties - 当事人信息
 * @param {string} caseContext - 案件背景
 * @param {function(string, number): void} [onProgress] - 进度回调
 * @returns {Promise<Object>} Analysis 对象
 */
async function analyzeChat(formattedChat, parties, caseContext, onProgress) {
  var config = getConfig();
  if (!config.apiKey) {
    throw new Error('Missing API key. Set LLM_API_KEY (or ANTHROPIC_API_KEY) environment variable.');
  }

  var userPrompt = analysisPrompt.buildAnalysisUserPrompt(formattedChat, parties, caseContext);

  // CoT Step 1: Understanding
  if (onProgress) {
    onProgress(COT_STEPS[0].step, COT_STEPS[0].progress);
  }

  var response = await fetch(buildChatEndpoint(config), {
    method: 'POST',
    headers: buildHeaders(config),
    body: buildRequestBody(config, [{ role: 'user', content: userPrompt }], 8192, false),
  });

  if (!response.ok) {
    var err = await response.text();
    throw new Error('LLM API error: ' + response.status + ' ' + err);
  }

  // CoT Steps 2-3: Evidence & Emotion (simulated while waiting for response body)
  if (onProgress) {
    onProgress(COT_STEPS[1].step, COT_STEPS[1].progress);
    onProgress(COT_STEPS[2].step, COT_STEPS[2].progress);
  }

  var data = await response.json();

  // CoT Step 4: Judging
  if (onProgress) {
    onProgress(COT_STEPS[3].step, COT_STEPS[3].progress);
  }

  var text = extractTextFromResponse(config, data);

  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from LLM response');
  }

  // CoT Step 5: Strategy
  if (onProgress) {
    onProgress(COT_STEPS[4].step, COT_STEPS[4].progress);
  }

  var parsed = JSON.parse(jsonMatch[0]);

  // CoT Step 6: Done
  if (onProgress) {
    onProgress(COT_STEPS[5].step, COT_STEPS[5].progress);
  }

  return parsed;
}

/**
 * 基于已有分析报告的追问（流式输出）。
 *
 * @param {string} context - 分析报告上下文（JSON 字符串）
 * @param {{role: string, content: string}[]} history - 历史消息
 * @param {string} newMessage - 新消息
 * @param {function(string): void} onChunk - 流式 chunk 回调
 * @returns {Promise<string>} 完整回答文本
 */
async function chatWithAnalysis(context, history, newMessage, onChunk) {
  var config = getConfig();

  var systemPrompt = chatPrompt.buildChatSystemPrompt(context);

  var messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
  ];
  for (var i = 0; i < history.length; i++) {
    messages.push({
      role: history[i].role,
      content: history[i].content,
    });
  }
  messages.push({ role: 'user', content: newMessage });

  var response = await fetch(buildChatEndpoint(config), {
    method: 'POST',
    headers: buildHeaders(config),
    body: buildRequestBody(config, messages, 2048, true),
  });

  if (!response.ok) {
    throw new Error('LLM chat error: ' + response.status);
  }

  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var fullText = '';

  while (true) {
    var result = await reader.read();
    if (result.done) break;

    var chunk = decoder.decode(result.value, { stream: true });
    var lines = chunk.split('\n').filter(function (l) { return l.startsWith('data: '); });

    for (var j = 0; j < lines.length; j++) {
      var line = lines[j];
      var data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        var parsed = JSON.parse(data);
        var text = extractStreamDelta(config, parsed);
        if (text) {
          fullText += text;
          if (onChunk) {
            onChunk(text);
          }
        }
      } catch (_) {
        // skip unparseable chunks
      }
    }
  }

  return fullText;
}

module.exports = {
  getConfig: getConfig,
  analyzeChat: analyzeChat,
  chatWithAnalysis: chatWithAnalysis,
  COT_STEPS: COT_STEPS,
};
