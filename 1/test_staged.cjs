// ═══════════════════════════════════════════════
// 分阶段分析计时测试 — 验证每阶段 < 55s（云函数 60s 上限内）
// 用法: LLM_API_KEY=sk-xxx node 1/test_staged.cjs
// ═══════════════════════════════════════════════
var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

async function timeIt(label, fn) {
  var t = Date.now();
  var r = await fn();
  var elapsed = ((Date.now() - t) / 1000).toFixed(1);
  console.log('  [' + label + '] ' + elapsed + 's');
  return { result: r, elapsed: parseFloat(elapsed) };
}

async function main() {
  var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
  var messages = parser.parseWeChatChatLog(ocrText);
  var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
  var formatted = parser.formatChatForLLM(messages, parties);
  console.log('解析: ' + messages.length + ' 条消息, ' + formatted.length + ' 字');
  console.log('长文本阈值: ' + (formatted.length > 8000 ? '需摘要' : '无需摘要'));
  console.log('\n=== 分阶段计时 ===');

  var total = 0;
  var chatText = formatted;
  var core, evidence, strategy;

  if (formatted.length > 8000) {
    var s = await timeIt('summarize', function () {
      return llm.analyzeChatStage('summarize', formatted, parties, CTX);
    });
    chatText = s.result; total += s.elapsed;
  }

  var c = await timeIt('core', function () {
    return llm.analyzeChatStage('core', chatText, parties, CTX);
  });
  core = c.result; total += c.elapsed;

  var e = await timeIt('evidence', function () {
    return llm.analyzeChatStage('evidence', chatText, parties, CTX, llm.compactPrior(core));
  });
  evidence = e.result; total += e.elapsed;

  var st = await timeIt('strategy', function () {
    return llm.analyzeChatStage('strategy', chatText, parties, CTX,
      llm.compactPrior({ core: core, evidence: { evidenceWeights: evidence.evidenceWeights, emotionCurve: evidence.emotionCurve } }));
  });
  strategy = st.result; total += st.elapsed;

  var merged = llm.mergeStages(core, evidence, strategy);
  console.log('\n=== 汇总 ===');
  console.log('  总耗时(顺序): ' + total.toFixed(1) + 's');
  console.log('  每阶段均 < 55s: ' + ([c.elapsed, e.elapsed, st.elapsed].every(function (x) { return x < 55; }) ? '✅' : '❌'));
  console.log('  core结论: ' + (merged.coreConclusion.oneLineVerdict || '').substring(0, 50));
  console.log('  证据数: ' + merged.evidenceWeights.length + ' | 策略数: ' + merged.mediationStrategy.length);
  console.log('  人物: ' + (merged.detailedAnalysis.characters || []).map(function (x) { return x.name; }).join(','));
  fs.writeFileSync('1/_staged_result.json', JSON.stringify(merged, null, 2), 'utf8');
  console.log('  详情: 1/_staged_result.json');
}

var CTX = '关系: 情侣\n案例: 分阶段测试\n性格信息:\n  甲方: MBTI: INFJ / 巨蟹座(水象)\n  乙方: MBTI: ISTP / 摩羯座(土象)';

main().catch(function (e) { console.error('测试崩溃:', e.message); process.exit(1); });
