// ═══════════════════════════════════════════════
// compressText 云函数
// 接收文本 → 调用 LLM 压缩提取关键信息 → 返回压缩结果
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var llm = require('./common/llm');

exports.main = async function (event, context) {
  try {
    var text = event.text || '';
    if (!text || !text.trim()) {
      return { code: -1, data: null, message: '缺少文本' };
    }

    // 只处理超过 5000 字的文本
    if (text.length <= 5000) {
      return { code: 0, data: { compressedText: text, originalLength: text.length, compressedLength: text.length, skipped: true }, message: '文本未超限，无需压缩' };
    }

    var compressed = await llm.compressText(text);
    return {
      code: 0,
      data: {
        compressedText: compressed,
        originalLength: text.length,
        compressedLength: compressed.length,
      },
      message: 'ok',
    };
  } catch (err) {
    console.error('compressText error:', err);
    return { code: -1, data: null, message: err.message || '压缩失败' };
  }
};
