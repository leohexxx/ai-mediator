// ═══════════════════════════════════════════════
// 视频素材 10 轮全链路测试
// 模拟: 20 帧抽帧 → 并行 OCR → LLM 分析 × 10
// ═══════════════════════════════════════════════
var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');

// 检查视频素材
var videoPath = '1/66d16aebd1f2d177c829c900d182ab0a.mp4';
var videoInfo = { ok: false };
if (fs.existsSync(videoPath)) {
  var stat = fs.statSync(videoPath);
  videoInfo = { ok: true, size: (stat.size/1024/1024).toFixed(1) + 'MB' };
}

// 模拟 20 帧抽帧（每帧取不同段落）
function simulateVideoFrames(ocrText, frameCount) {
  var sliceSize = Math.floor(ocrText.length / frameCount);
  var frames = [];
  for (var i = 0; i < frameCount; i++) {
    var start = i * sliceSize;
    var end = Math.min(start + sliceSize, ocrText.length);
    frames.push(ocrText.substring(start, end));
  }
  return frames;
}

var FRAMES = simulateVideoFrames(ocrText, 20);

// 10 组性格组合（带中文标签）
var COMBOS = [
  { label: 'INFJ巨蟹/ISTP摩羯', a: 'MBTI: INFJ / 巨蟹座(水象)', b: 'MBTI: ISTP / 摩羯座(土象)' },
  { label: 'ENFP双子/INTJ处女', a: 'MBTI: ENFP / 双子座(风象)', b: 'MBTI: INTJ / 处女座(土象)' },
  { label: 'ISFJ金牛/ENTP射手', a: 'MBTI: ISFJ / 金牛座(土象)', b: 'MBTI: ENTP / 射手座(火象)' },
  { label: 'ENTJ天蝎/ISFP天秤', a: 'MBTI: ENTJ / 天蝎座(水象)', b: 'MBTI: ISFP / 天秤座(风象)' },
  { label: 'INTP水瓶/ESFJ巨蟹', a: 'MBTI: INTP / 水瓶座(风象)', b: 'MBTI: ESFJ / 巨蟹座(水象)' },
  { label: 'ESTJ狮子/INFP双鱼', a: 'MBTI: ESTJ / 狮子座(火象)', b: 'MBTI: INFP / 双鱼座(水象)' },
  { label: 'ISTJ摩羯/ENFJ狮子', a: 'MBTI: ISTJ / 摩羯座(土象)', b: 'MBTI: ENFJ / 狮子座(火象)' },
  { label: 'ESTP白羊/INFJ处女', a: 'MBTI: ESTP / 白羊座(火象)', b: 'MBTI: INFJ / 处女座(土象)' },
  { label: 'ESFP射手/INTJ天蝎', a: 'MBTI: ESFP / 射手座(火象)', b: 'MBTI: INTJ / 天蝎座(水象)' },
  { label: 'INFP双鱼/ESTJ金牛', a: 'MBTI: INFP / 双鱼座(水象)', b: 'MBTI: ESTJ / 金牛座(土象)' },
];

async function runRound(index) {
  var combo = COMBOS[index];
  var round = index + 1;

  // 模拟视频拼接：20 帧按时间戳拼接
  var videoChat = '';
  var interval = 3; // 每 3s 一帧
  for (var i = 0; i < FRAMES.length; i++) {
    var sec = i * interval;
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    videoChat += '[视频 ' + m + ':' + (s < 10 ? '0' : '') + s + ']\n' + FRAMES[i] + '\n\n';
  }

  var messages = parser.parseWeChatChatLog(videoChat);
  var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
  var formatted = parser.formatChatForLLM(messages, parties);

  var caseContext = '关系: 情侣\n案例: 视频测试#' + round + ' (' + combo.label + ')\n来源: 视频录制\n性格信息:\n  甲方: ' + combo.a + '\n  乙方: ' + combo.b;

  var t0 = Date.now();
  var result = await llm.analyzeChat(formatted, parties, caseContext, function(){});
  var elapsed = ((Date.now()-t0)/1000).toFixed(1);

  var cc = result.coreConclusion;
  var checks = {
    coreConclusion: !!cc,
    verdict: !!(cc && (cc.oneLineVerdict || cc.overallWinner)),
    scores: !!(cc && typeof cc.scoreA === 'number' && typeof cc.scoreB === 'number'),
    evidence: Array.isArray(result.evidenceWeights) && result.evidenceWeights.length >= 3,
    strategy: Array.isArray(result.mediationStrategy) && result.mediationStrategy.length >= 3,
    advice: !!(result.advice && result.advice.toA && result.advice.toB),
    characters: !!(result.detailedAnalysis && Array.isArray(result.detailedAnalysis.characters) && result.detailedAnalysis.characters.length >= 2),
  };

  var passCount = Object.values(checks).filter(function(v) { return v; }).length;
  var totalChecks = Object.keys(checks).length;

  return {
    round: round, label: combo.label,
    elapsed: elapsed, passCount: passCount, totalChecks: totalChecks,
    allPassed: passCount === totalChecks,
    verdict: cc ? (cc.oneLineVerdict || cc.overallWinner || '?').substring(0, 40) : '?',
    scoreA: cc ? cc.scoreA : '?', scoreB: cc ? cc.scoreB : '?',
    confidence: cc ? cc.confidence : '?',
  };
}

async function main() {
  console.log('══════════════════════════════════════');
  console.log('  视频素材 10 轮全链路测试');
  console.log('══════════════════════════════════════');
  console.log('  视频文件: ' + (videoInfo.ok ? '✅ ' + videoInfo.size : '❌ 不存在'));
  console.log('  模拟抽帧: 20 帧 (每 3s 一帧)');
  console.log('  原始 OCR: ' + ocrText.length + ' 字');
  console.log('  模拟拼接: ' + FRAMES.map(function(f) { return f.length; }).join('+') + ' 字\n');

  var results = [];
  var totalStart = Date.now();

  for (var i = 0; i < 10; i++) {
    try {
      var r = await runRound(i);
      results.push(r);
      var icon = r.allPassed ? '✅' : '❌';
      console.log('  [' + r.round + '/10] ' + icon + ' ' + r.label + ' | ' + r.elapsed + 's | ' + r.passCount + '/' + r.totalChecks + ' | ' + r.verdict + ' | A:' + r.scoreA + ' B:' + r.scoreB);
    } catch (e) {
      results.push({ round: i+1, label: COMBOS[i].label, elapsed: '0', passCount: 0, totalChecks: 7, allPassed: false, error: e.message.substring(0, 60) });
      console.log('  [' + (i+1) + '/10] ❌ ' + COMBOS[i].label + ' | CRASH: ' + e.message.substring(0, 60));
    }
  }

  var totalElapsed = ((Date.now()-totalStart)/1000).toFixed(0);
  var passed = results.filter(function(r) { return r.allPassed; }).length;
  var avgTime = (results.filter(function(r){return parseFloat(r.elapsed)>0}).reduce(function(s,r){return s+parseFloat(r.elapsed)},0) / Math.max(1, passed)).toFixed(1);

  console.log('\n' + '═'.repeat(50));
  console.log('  视频 10 轮汇总');
  console.log('═'.repeat(50));
  console.log('  通过: ' + passed + '/10');
  console.log('  总耗时: ' + totalElapsed + 's | 平均: ' + avgTime + 's/轮');
  console.log('  最终: ' + (passed===10 ? '✅ 全部通过' : '❌ 有 ' + (10-passed) + ' 轮失败'));

  // 保存
  fs.writeFileSync('1/_video_10round_test.json', JSON.stringify({
    video: videoInfo,
    simulatedFrames: FRAMES.length,
    totalOcrChars: ocrText.length,
    simulatedChars: FRAMES.reduce(function(s,f){return s+f.length},0),
    results: results,
    summary: { passed: passed, total: 10, totalTime: totalElapsed+'s', avgTime: avgTime+'s' },
  }, null, 2), 'utf8');
  console.log('  详情: 1/_video_10round_test.json');
}

main().catch(function(e) { console.error('测试崩溃:', e.message); });
