// ═══════════════════════════════════════════════
// 真实数据计时测试 — 用 1/ 下图片 OCR 的真实聊天记录
// 用法: node --env-file=server/.env 1/test_real_data.cjs
// ═══════════════════════════════════════════════
var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');
var ap = require('../cloudfunctions/common/prompts/analysisPrompt');

var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
var messages = parser.parseWeChatChatLog(ocrText);
var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
var formatted = parser.formatChatForLLM(messages, parties);
var CTX = '关系: 情侣\n性格信息:\n  甲方: MBTI: INFJ / 巨蟹座\n  乙方: MBTI: ISTP / 摩羯座';

console.log('真实聊天记录:');
console.log('  文件: 1/_ocr_result.txt (' + ocrText.length + '字节)');
console.log('  消息: ' + messages.length + ' 条');
console.log('  格式化后: ' + formatted.length + ' 字');
console.log('  触发摘要: ' + (formatted.length > ap.SUMMARIZE_THRESHOLD ? '是 (>' + ap.SUMMARIZE_THRESHOLD + ')' : '否'));
console.log('');

// 测每阶段耗时
var results = {};

async function timeIt(label, fn) {
  var t = Date.now();
  try {
    var r = await fn();
    var s = ((Date.now() - t) / 1000).toFixed(1);
    console.log('  [' + label + '] ' + s + 's ✅');
    results[label] = { elapsed: parseFloat(s), ok: true };
    return r;
  } catch (e) {
    var s = ((Date.now() - t) / 1000).toFixed(1);
    console.log('  [' + label + '] ' + s + 's ❌ ' + (e.message || '').substring(0, 60));
    results[label] = { elapsed: parseFloat(s), ok: false, err: e.message };
    return null;
  }
}

async function main() {
  process.env.LLM_MODEL = 'deepseek-v4-flash';
  var chatText = formatted;
  var t0 = Date.now();

  // 摘要（如需要）
  if (formatted.length > ap.SUMMARIZE_THRESHOLD) {
    chatText = await timeIt('summarize', function () {
      return llm.analyzeChatStage('summarize', formatted, parties, CTX, null, 'deepseek-v4-flash');
    });
  }

  // core
  var core = await timeIt('core', function () {
    return llm.analyzeChatStage('core', chatText, parties, CTX, null, 'deepseek-v4-flash');
  });

  // evidence
  var evidence = await timeIt('evidence', function () {
    return llm.analyzeChatStage('evidence', chatText, parties, CTX, llm.compactPrior(core), 'deepseek-v4-flash');
  });

  // strategy
  var strategy = await timeIt('strategy', function () {
    return llm.analyzeChatStage('strategy', chatText, parties, CTX, llm.compactPrior({
      core: core,
      evidence: { evidenceWeights: evidence ? evidence.evidenceWeights : [], emotionCurve: evidence ? evidence.emotionCurve : [] }
    }), 'deepseek-v4-flash');
  });

  var total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('=== 汇总 ===');
  console.log('  总耗时(顺序): ' + total + 's');
  var allOk = Object.values(results).every(function (r) { return r.ok; });
  var allUnder55 = Object.values(results).every(function (r) { return r.elapsed < 55; });
  console.log('  结果完整性: ' + (allOk ? '✅' : '❌'));
  console.log('  每阶段 < 55s: ' + (allUnder55 ? '✅' : '❌'));
  if (core && core.coreConclusion) {
    console.log('  核心结论: ' + (core.coreConclusion.oneLineVerdict || '').substring(0, 60));
    console.log('  证据: ' + (evidence ? evidence.evidenceWeights.length : 0) + '条');
    console.log('  情绪: ' + (evidence ? emotionCount(evidence) : 0) + '条');
    console.log('  策略: ' + (strategy ? strategy.mediationStrategy.length : 0) + '条');
  }
  console.log('  详情: 1/_real_data_result.json');
  var output = { summary: { totalS: total, ok: allOk, allUnder55: allUnder55, model: 'deepseek-v4-flash', ocrChars: ocrText.length, messages: messages.length, formattedChars: formatted.length },
    perStage: results, core: core ? core.coreConclusion : null };
  fs.writeFileSync('1/_real_data_result.json', JSON.stringify(output, null, 2), 'utf8');
}

function emotionCount(ev) {
  return (ev.emotionCurve || []).reduce(function (s, c) { return s + (c.points || []).length; }, 0);
}

main().catch(function (e) { console.error('崩溃:', e.message); process.exit(1); });
