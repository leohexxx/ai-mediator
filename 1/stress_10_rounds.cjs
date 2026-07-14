// ═══════════════════════════════════════════════
// 10 轮端到端压力测试 — 不同性格组合
// 素材: 1/_ocr_result.txt (11 张聊天截图 OCR)
// ═══════════════════════════════════════════════
var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');

// 10 组不同性格组合
var COMBOS = [
  { a: 'MBTI: INFJ / 星座: 巨蟹座(水象)', aDesc: '理想主义、敏感、渴望深度连接', b: 'MBTI: ISTP / 星座: 摩羯座(土象)', bDesc: '冷静务实、不善言辞、用行动表达' },
  { a: 'MBTI: ENFP / 星座: 双子座(风象)', aDesc: '热情创意、善变、需要情感共鸣', b: 'MBTI: INTJ / 星座: 处女座(土象)', bDesc: '理性独立、追求完美、挑剔但好意' },
  { a: 'MBTI: ISFJ / 星座: 金牛座(土象)', aDesc: '温暖忠诚、重视承诺、默默付出', b: 'MBTI: ENTP / 星座: 射手座(火象)', bDesc: '机智善辩、爱自由、回避深层情感' },
  { a: 'MBTI: ESTJ / 星座: 狮子座(火象)', aDesc: '果断负责、需要认可、不轻易示弱', b: 'MBTI: INFP / 星座: 双鱼座(水象)', bDesc: '温柔理想化、容易退缩、需要安全感' },
  { a: 'MBTI: ENTJ / 星座: 天蝎座(水象)', aDesc: '有领导力、掌控欲强、情感激烈', b: 'MBTI: ISFP / 星座: 天秤座(风象)', bDesc: '随性温和、追求和谐、回避正面冲突' },
  { a: 'MBTI: INTP / 星座: 水瓶座(风象)', aDesc: '好奇善分析、把关系当问题解决', b: 'MBTI: ESFJ / 星座: 巨蟹座(水象)', bDesc: '热心尽责、过度操心、需要情感回馈' },
  { a: 'MBTI: ISTJ / 星座: 摩羯座(土象)', aDesc: '务实可靠、用行动证明、回避情感交流', b: 'MBTI: ENFJ / 星座: 狮子座(火象)', bDesc: '热情激励、过度付出、需被认可' },
  { a: 'MBTI: ESTP / 星座: 白羊座(火象)', aDesc: '直接大胆、行动导向、冲动伤人', b: 'MBTI: INFJ / 星座: 处女座(土象)', bDesc: '理想主义、追求完美、易受伤' },
  { a: 'MBTI: ESFP / 星座: 射手座(火象)', aDesc: '活泼热情、逃避深层冲突', b: 'MBTI: INTJ / 星座: 天蝎座(水象)', bDesc: '理性独立、洞察力强、不轻易原谅' },
  { a: 'MBTI: INFP / 星座: 双鱼座(水象)', aDesc: '温柔浪漫、容易自我牺牲', b: 'MBTI: ESTJ / 星座: 金牛座(土象)', bDesc: '高效负责、固执、不善情感表达' },
];

var results = [];
var startAll = Date.now();

async function runRound(index) {
  var combo = COMBOS[index];
  var round = index + 1;
  
  console.log('\n' + '='.repeat(50));
  console.log('  第 ' + round + '/10 轮');
  console.log('  甲方: ' + combo.a + ' (' + combo.aDesc + ')');
  console.log('  乙方: ' + combo.b + ' (' + combo.bDesc + ')');
  console.log('='.repeat(50));

  var messages = parser.parseWeChatChatLog(ocrText);
  var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
  var formatted = parser.formatChatForLLM(messages, parties);

  var caseContext = '关系: 情侣\n案例: 恋爱沟通纠纷 #' + round + '\n性格信息:\n  甲方: ' + combo.a + '\n  乙方: ' + combo.b;

  var startTime = Date.now();
  var result = await llm.analyzeChat(formatted, parties, caseContext, function() {});
  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // 验证检查
  var cc = result.coreConclusion;
  var checks = {
    coreConclusion: !!cc,
    verdict: !!(cc && (cc.oneLineVerdict || cc.overallWinner)),
    scores: !!(cc && typeof cc.scoreA === 'number' && typeof cc.scoreB === 'number'),
    confidence: !!(cc && typeof cc.confidence === 'number'),
    evidence: Array.isArray(result.evidenceWeights) && result.evidenceWeights.length >= 3,
    emotion: Array.isArray(result.emotionCurve),
    strategy: Array.isArray(result.mediationStrategy) && result.mediationStrategy.length >= 3,
    advice: !!(result.advice && result.advice.toA && result.advice.toB),
    characters: !!(result.detailedAnalysis && Array.isArray(result.detailedAnalysis.characters)),
    personality: false,
  };

  // 检查性格分析是否体现
  if (result.detailedAnalysis && result.detailedAnalysis.characters) {
    var c = result.detailedAnalysis.characters;
    for (var i = 0; i < c.length; i++) {
      var p = (c[i].personality || '');
      if (p.length > 20) checks.personality = true;
    }
  }

  var checkValues = Object.values(checks);
  var passed = checkValues.filter(function(v) { return v; }).length;
  var total = checkValues.length;

  results.push({
    round: round,
    elapsed: elapsed,
    passed: passed,
    total: total,
    all: passed === total,
    verdict: cc ? (cc.oneLineVerdict || cc.overallWinner || '?') : '?',
    scoreA: cc ? cc.scoreA : '?',
    scoreB: cc ? cc.scoreB : '?',
    confidence: cc ? cc.confidence : '?',
  });

  var status = passed === total ? '✅' : '❌';
  console.log('  ' + status + ' ' + elapsed + 's | ' + passed + '/' + total +
    ' | 判定:' + (results[results.length-1].verdict).substring(0,30) +
    ' | A:' + results[results.length-1].scoreA + ' B:' + results[results.length-1].scoreB +
    ' | 置信:' + results[results.length-1].confidence + '%');
}

async function main() {
  console.log('开始 10 轮截图分析压力测试...');
  console.log('OCR 文本: 5675 字, 68 条消息');

  for (var i = 0; i < 10; i++) {
    try {
      await runRound(i);
    } catch (e) {
      console.log('  第' + (i+1) + '轮 ❌ 异常: ' + e.message);
      results.push({ round: i+1, elapsed: '0', passed: 0, total: 10, all: false, error: e.message });
    }
  }

  // 汇总
  var totalTime = ((Date.now() - startAll) / 1000).toFixed(0);
  var allPassed = results.every(function(r) { return r.all; });
  var avgTime = (results.reduce(function(s, r) { return s + parseFloat(r.elapsed) || 0; }, 0) / results.length).toFixed(1);

  console.log('\n' + '═'.repeat(50));
  console.log('  截图分析 10 轮汇总');
  console.log('═'.repeat(50));
  results.forEach(function(r) {
    console.log('  第' + r.round + '轮: ' + (r.all ? '✅' : '❌') + ' ' + r.elapsed + 's | ' + r.passed + '/' + r.total + ' | ' + r.verdict.substring(0,30));
  });
  console.log('  总耗时: ' + totalTime + 's | 平均: ' + avgTime + 's/轮');
  console.log('  最终: ' + (allPassed ? '✅ 全部通过' : '❌ 有失败'));

  // 保存结果
  fs.writeFileSync('1/_stress_test_10_rounds.json', JSON.stringify({
    combos: COMBOS,
    results: results,
    summary: { total: totalTime+'s', average: avgTime+'s', allPassed: allPassed },
  }, null, 2), 'utf8');
  console.log('  详细: 1/_stress_test_10_rounds.json');

  // 同时验证视频素材存在
  if (fs.existsSync('1/66d16aebd1f2d177c829c900d182ab0a.mp4')) {
    var stat = fs.statSync('1/66d16aebd1f2d177c829c900d182ab0a.mp4');
    console.log('\n  视频素材: ✅ 存在 (' + (stat.size/1024/1024).toFixed(1) + 'MB)');
  } else {
    console.log('\n  视频素材: ❌ 不存在');
  }
}

main().catch(function(e) { console.error('测试崩溃:', e.message); });
