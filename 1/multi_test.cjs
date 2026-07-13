// ═══════════════════════════════════════════════
// 多轮端到端测试 — OCR + 解析 + LLM 分析
// 用文件夹 1/ 的 11 张聊天截图
// ═══════════════════════════════════════════════
var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');

// 模拟两轮"不同案例"，验证无缓存问题
async function runTest(round, personalityInfo) {
  console.log('\n' + '='.repeat(60));
  console.log('  第 ' + round + ' 轮测试');
  console.log('='.repeat(60));

  var messages = parser.parseWeChatChatLog(ocrText);
  console.log('  [解析] ' + messages.length + ' 条消息');

  var parties1 = [{ name: '甲方', role: 'party_a' }, { name: '对方', role: 'party_b' }];
  var formatted1 = parser.formatChatForLLM(messages, parties1);

  var caseContext = '关系: 情侣\n案例: 恋爱沟通纠纷测试#' + round + '\n' + personalityInfo;

  var startTime = Date.now();

  // 追踪每个 CoT 步骤
  var steps = [];
  var result = await llm.analyzeChat(formatted1, parties1, caseContext, function(step, progress) {
    steps.push({ step: step, progress: progress, time: Date.now() - startTime });
  });

  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // 验证结果完整性
  var checks = {
    hasCoreConclusion: !!result.coreConclusion,
    hasVerdict: !!(result.coreConclusion && (result.coreConclusion.oneLineVerdict || result.coreConclusion.overallWinner)),
    hasEvidence: Array.isArray(result.evidenceWeights) && result.evidenceWeights.length > 0,
    hasEmotion: Array.isArray(result.emotionCurve) && result.emotionCurve.length > 0,
    hasStrategy: Array.isArray(result.mediationStrategy) && result.mediationStrategy.length > 0,
    hasAdvice: !!result.advice,
    hasDetailedAnalysis: !!result.detailedAnalysis,
    hasCharacters: !!(result.detailedAnalysis && Array.isArray(result.detailedAnalysis.characters)),
    hasPersonalityInChars: false,
  };

  // 检查是否包含性格分析
  if (result.detailedAnalysis && result.detailedAnalysis.characters) {
    var chars = result.detailedAnalysis.characters;
    for (var i = 0; i < chars.length; i++) {
      var p = (chars[i].personality || '');
      if (p.indexOf('MBTI') !== -1 || p.indexOf('INFJ') !== -1 || p.indexOf('ISTP') !== -1 ||
          p.indexOf('巨蟹') !== -1 || p.indexOf('摩羯') !== -1 || p.indexOf('水象') !== -1) {
        checks.hasPersonalityInChars = true;
      }
    }
  }

  var allChecks = Object.values(checks);
  var passed = allChecks.filter(function(v) { return v; }).length;
  var total = allChecks.length;
  var passedAll = passed === total;

  console.log('  [耗时] ' + elapsed + 's');
  console.log('  [步骤] ' + steps.length + ' 步 CoT');
  console.log('  [结果] ' + passed + '/' + total + ' 检查通过');
  console.log('  [结论] ' + (result.coreConclusion ? (result.coreConclusion.oneLineVerdict || result.coreConclusion.overallWinner || '?') : 'MISSING'));
  console.log('  [评分] A:' + (result.coreConclusion ? result.coreConclusion.scoreA : '?') + ' B:' + (result.coreConclusion ? result.coreConclusion.scoreB : '?'));
  console.log('  [置信] ' + (result.coreConclusion ? result.coreConclusion.confidence : '?') + '%');
  console.log('  [性格] ' + (checks.hasPersonalityInChars ? '✅ 已分析' : '❌ 未体现'));

  // 保存每轮结果
  fs.writeFileSync('1/_test_round' + round + '.json', JSON.stringify({
    round: round,
    elapsed: elapsed + 's',
    checks: checks,
    passed: passed + '/' + total,
    passedAll: passedAll,
    steps: steps,
    conclusion: result.coreConclusion ? {
      verdict: result.coreConclusion.oneLineVerdict || result.coreConclusion.overallWinner,
      scoreA: result.coreConclusion.scoreA,
      scoreB: result.coreConclusion.scoreB,
      confidence: result.coreConclusion.confidence,
    } : null,
    personality: result.detailedAnalysis && result.detailedAnalysis.characters ?
      result.detailedAnalysis.characters.map(function(c) { return { name: c.name, personality: (c.personality||'').substring(0,100) }; }) : [],
  }, null, 2), 'utf8');

  return { passedAll: passedAll, elapsed: parseFloat(elapsed) };
}

async function main() {
  console.log('开始多轮端到端测试...');
  var results = [];

  // 第 1 轮：带性格信息
  results.push(await runTest(1,
    '\n性格信息:\n' +
    '  甲方: MBTI: INFJ（提倡者型：理想主义、深富同理心，对关系质量要求极高，渴望深度连接，但容易因期望落差而受伤）\n' +
    '    星座: 巨蟹座 - 敏感、念旧、情绪化，冲突中容易受伤和退缩，需要情感安全感\n' +
    '  乙方: MBTI: ISTP（鉴赏家型：冷静、务实、喜欢动手解决具体问题，在关系中不善言辞和情感表达）\n' +
    '    星座: 摩羯座 - 务实、隐忍、责任感强，冲突中倾向于压抑情绪，用行动而非语言表达'
  ));

  // 第 2 轮：换个性格组合 — 验证无缓存（结果应不同）
  results.push(await runTest(2,
    '\n性格信息:\n' +
    '  甲方: MBTI: ENFP（竞选家型：热情、富有创意，渴望新鲜感，在关系中需要持续的刺激和情感共鸣）\n' +
    '    星座: 双子座 - 善于沟通但善变，冲突中倾向于用理性辩论，可能回避深层情感\n' +
    '  乙方: MBTI: INTJ（建筑师型：理性独立、有战略思维，倾向于用逻辑解决问题而非情感安慰）\n' +
    '    星座: 处女座 - 追求完美、注重细节，冲突中可能显得挑剔，实则想帮对方改进'
  ));

  // 第 3 轮：无双性格 — 验证降级正常
  results.push(await runTest(3, ''));

  // 汇总
  var totalTime = 0;
  var allPassed = true;
  console.log('\n' + '='.repeat(60));
  console.log('  测试汇总');
  console.log('='.repeat(60));

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    totalTime += r.elapsed;
    if (!r.passedAll) allPassed = false;
    console.log('  第' + (i+1) + '轮: ' + (r.passedAll ? '✅' : '❌') + ' ' + r.elapsed + 's');
  }

  console.log('  总耗时: ' + totalTime.toFixed(0) + 's');
  console.log('  最终结果: ' + (allPassed ? '✅ 全部通过' : '❌ 有失败'));
  console.log('  详情: 1/_test_round*.json');
}

main().catch(function(e) { console.error('测试异常:', e.message); });
