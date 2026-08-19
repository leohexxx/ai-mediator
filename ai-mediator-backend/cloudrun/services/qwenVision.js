var config = require('../config');

var SYSTEM_PROMPT = [
  '你是微信聊天截图取证识别助手。只提取图片中真实可见的信息，不推测被遮挡内容。',
  '按从上到下顺序识别每条消息，并根据气泡位置区分：右侧=self，左侧=other，中间通知=system。',
  '保留日期、时间、金额、转账、撤回、引用和系统提示。',
  '只返回一个JSON对象，不要Markdown：',
  '{"text":"按阅读顺序合并的文字","blocks":[{"text":"单条内容","speakerHint":"self|other|system","confidence":0到100}]}',
].join('\n');

function extractJson(text) {
  var value = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  var start = value.indexOf('{');
  var end = value.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('千问视觉模型未返回有效JSON');
  return JSON.parse(value.slice(start, end + 1));
}

function normalizeResult(parsed) {
  var blocks = Array.isArray(parsed.blocks) ? parsed.blocks.map(function (block) {
    var speaker = ['self', 'other', 'system'].indexOf(block.speakerHint) !== -1 ? block.speakerHint : 'system';
    var confidence = Number(block.confidence);
    return {
      text: String(block.text || '').trim(),
      speakerHint: speaker,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 90,
    };
  }).filter(function (block) { return !!block.text; }) : [];
  var text = String(parsed.text || '').trim();
  if (!text && blocks.length) text = blocks.map(function (block) { return block.text; }).join('\n');
  return { text: text, blocks: blocks };
}

async function defaultRequest(payload) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, config.qwenVision.requestTimeoutMs);
  try {
    var response = await fetch(config.qwenVision.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + config.qwenVision.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    var body = await response.text();
    if (!response.ok) throw new Error('千问视觉API ' + response.status + ': ' + body.slice(0, 200));
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

function createService(options) {
  options = options || {};
  var request = options.request || defaultRequest;
  async function recognizeImage(base64Image) {
    if (!config.qwenVision.apiKey && !options.request) throw new Error('QWEN_VISION_API_KEY未配置');
    var response = await request({
      model: config.qwenVision.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + String(base64Image || '') } },
          { type: 'text', text: '识别这张聊天截图并严格按约定JSON输出。' },
        ] },
      ],
      stream: false,
      temperature: 0,
      max_tokens: 4096,
    });
    var content = response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
    return normalizeResult(extractJson(content));
  }
  return { recognizeImage: recognizeImage };
}

module.exports = Object.assign(createService(), {
  createService: createService,
  extractJson: extractJson,
  normalizeResult: normalizeResult,
});
