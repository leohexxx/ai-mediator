// ═══════════════════════════════════════════════
// 长文本测试 — 拼接超阈值字符，验证 summarize → 3阶段 流程
// 用法: node --env-file=server/.env 1/test_longtext.cjs
// ═══════════════════════════════════════════════
var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');
var ap = require('../cloudfunctions/common/prompts/analysisPrompt');

async function main() {
  var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
  // 拼接 3 倍 → 超过 8000 阈值，触发摘要
  var longRaw = (ocrText + '\n\n--- 次日续聊 ---\n' + ocrText + '\n\n--- 第三天 ---\n' + ocrText);
  var messages = parser.parseWeChatChatLog(longRaw);
  var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
  var formatted = parser.formatChatForLLM(messages, parties);
  console.log('解析: ' + messages.length + ' 条消息, ' + formatted.length + ' 字');
  console.log('触发摘要: ' + (formatted.length > ap.SUMMARIZE_THRESHOLD ? '是' : '否') + '\n');

  var CTX = '关系: 情侣\n案例: 长文本测试\n性格信息:\n  甲方: MBTI: INFJ / 巨蟹座\n  乙方: MBTI: ISTP / 摩羯座';
  var t0 = Date.now();
  var result = await llm.analyzeChat(formatted, parties, CTX, function (step, p) {
    console.log('  [' + p + '%] ' + step);
  });
  var total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n=== 完成 ' + total + 's ===');
  console.log('coreConclusion: ' + (!!result.coreConclusion && !!result.coreConclusion.oneLineVerdict ? '✓' : '✗'));
  console.log('evidenceWeights: ' + (result.evidenceWeights || []).length);
  console.log('emotionCurve: ' + (result.emotionCurve || []).length);
  console.log('mediationStrategy: ' + (result.mediationStrategy || []).length);
  console.log('characters: ' + ((result.detailedAnalysis && result.detailedAnalysis.characters) || []).length);
  console.log('conflicts: ' + ((result.detailedAnalysis && result.detailedAnalysis.conflicts) || []).length);
  console.log('timeline: ' + ((result.detailedAnalysis && result.detailedAnalysis.timeline) || []).length);
  console.log('advice.toA: ' + ((result.advice && result.advice.toA) || []).length);
  console.log('verdict: ' + (result.coreConclusion.oneLineVerdict || '').substring(0, 60));
  fs.writeFileSync('1/_longtext_result.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('详情: 1/_longtext_result.json');
}
main().catch(function (e) { console.error('崩溃:', e.message); process.exit(1); });
