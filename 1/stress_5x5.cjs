// ═══════════════════════════════════════════════
// 5 轮截图 + 5 轮视频模拟压力测试
// ═══════════════════════════════════════════════
var fs = require('fs');
var https = require('https');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
var TEST_FILE = '1/_stress_5_plus_5.json';

// 视频素材验证
function testVideoFile() {
  var path = '1/66d16aebd1f2d177c829c900d182ab0a.mp4';
  if (!fs.existsSync(path)) return { ok: false, msg: '视频文件不存在' };
  var stat = fs.statSync(path);
  return { ok: true, size: (stat.size/1024/1024).toFixed(1) + 'MB' };
}

// OCR API 连通性测试
function testOcrApi() {
  return new Promise(function(resolve) {
    var base64 = fs.readFileSync('1/99cbcd593946e630bb89123576b7e3f2.jpg').toString('base64');
    var payload = 'isOverlayRequired=false&base64Image=' + encodeURIComponent('data:image/jpeg;base64,' + base64) + '&OCREngine=2&filetype=JPG&language=chs';
    var t0 = Date.now();
    var req = https.request({
      hostname: 'api.ocr.space', port: 443, path: '/parse/image', method: 'POST',
      headers: { 'apikey': 'K86789598888957', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload, 'utf8') },
      timeout: 20000,
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve({ ok: !!data.ParsedResults, time: ((Date.now()-t0)/1000).toFixed(1)+'s', chars: (data.ParsedResults&&data.ParsedResults[0]?data.ParsedResults[0].ParsedText.length:0) });
      });
    });
    req.on('error', function(e) { resolve({ ok: false, error: e.message }); });
    req.on('timeout', function() { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload); req.end();
  });
}

// 5 种性格组合
var COMBOS = [
  { round: 'A', a: 'MBTI: INFJ / 巨蟹座(水象)', b: 'MBTI: ISTP / 摩羯座(土象)' },
  { round: 'B', a: 'MBTI: ENFP / 双子座(风象)', b: 'MBTI: INTJ / 处女座(土象)' },
  { round: 'C', a: 'MBTI: ISFJ / 金牛座(土象)', b: 'MBTI: ENTP / 射手座(火象)' },
  { round: 'D', a: 'MBTI: ENTJ / 天蝎座(水象)', b: 'MBTI: ISFP / 天秤座(风象)' },
  { round: 'E', a: 'MBTI: INTP / 水瓶座(风象)', b: 'MBTI: ESFJ / 巨蟹座(水象)' },
];

async function runScreenshotRound(combo, index) {
  var messages = parser.parseWeChatChatLog(ocrText);
  var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
  var formatted = parser.formatChatForLLM(messages, parties);
  var caseContext = '关系: 情侣\n案例: 测试#' + combo.round + '\n性格信息:\n  甲方: ' + combo.a + '\n  乙方: ' + combo.b;
  var t0 = Date.now();
  var result = await llm.analyzeChat(formatted, parties, caseContext, function(){});
  var elapsed = ((Date.now()-t0)/1000).toFixed(1);
  var cc = result.coreConclusion;
  return {
    round: combo.round, type: '截图', elapsed: elapsed,
    verdict: cc ? (cc.oneLineVerdict||cc.overallWinner||'?') : '?',
    scoreA: cc ? cc.scoreA : '?', scoreB: cc ? cc.scoreB : '?',
    confidence: cc ? cc.confidence : '?',
    passes: { cc: !!cc, verdict: !!(cc&&(cc.oneLineVerdict||cc.overallWinner)),
      evidence: Array.isArray(result.evidenceWeights)&&result.evidenceWeights.length>=3,
      strategy: Array.isArray(result.mediationStrategy)&&result.mediationStrategy.length>=3,
      advice: !!(result.advice&&result.advice.toA), characters: !!(result.detailedAnalysis&&result.detailedAnalysis.characters) },
  };
}

async function runVideoSimRound(combo, index) {
  // 视频场景：模拟视频抽帧后的 OCR 文本
  var videoOcrText = '[视频 0:15]\n' + ocrText.substring(0, 1500) + '\n\n[视频 1:30]\n' + ocrText.substring(1500, 3000);
  var messages = parser.parseWeChatChatLog(videoOcrText);
  var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
  var formatted = parser.formatChatForLLM(messages, parties);
  var caseContext = '关系: 情侣\n案例: 视频测试#' + combo.round + '\n来源: 视频录制提取\n性格信息:\n  甲方: ' + combo.a + '\n  乙方: ' + combo.b;
  var t0 = Date.now();
  var result = await llm.analyzeChat(formatted, parties, caseContext, function(){});
  var elapsed = ((Date.now()-t0)/1000).toFixed(1);
  var cc = result.coreConclusion;
  return {
    round: combo.round, type: '视频模拟', elapsed: elapsed,
    verdict: cc ? (cc.oneLineVerdict||cc.overallWinner||'?') : '?',
    scoreA: cc ? cc.scoreA : '?', scoreB: cc ? cc.scoreB : '?',
    confidence: cc ? cc.confidence : '?',
    passes: { cc: !!cc, verdict: !!(cc&&(cc.oneLineVerdict||cc.overallWinner)),
      evidence: Array.isArray(result.evidenceWeights)&&result.evidenceWeights.length>=3,
      strategy: Array.isArray(result.mediationStrategy)&&result.mediationStrategy.length>=3,
      advice: !!(result.advice&&result.advice.toA), characters: !!(result.detailedAnalysis&&result.detailedAnalysis.characters) },
  };
}

async function main() {
  console.log('══════════════════════════════════════');
  console.log('  压力测试: 5 轮截图 + 5 轮视频模拟');
  console.log('══════════════════════════════════════\n');

  // 前置检查
  var videoCheck = testVideoFile();
  console.log('[前置] 视频素材: ' + (videoCheck.ok ? '✅ ' + videoCheck.size : '❌ ' + videoCheck.msg));

  console.log('[前置] OCR API 测试...');
  var ocrCheck = await testOcrApi();
  console.log('[前置] OCR API: ' + (ocrCheck.ok ? '✅ ' + ocrCheck.time + ' / ' + ocrCheck.chars + '字' : '❌ ' + ocrCheck.error));

  console.log('\n开始 10 轮测试...\n');

  var allResults = [];
  var totalStart = Date.now();

  // 5 轮截图
  for (var i = 0; i < 5; i++) {
    var combo = COMBOS[i];
    try {
      var r = await runScreenshotRound(combo, i);
      var p = Object.values(r.passes).filter(function(v){return v;}).length;
      var tf = Object.keys(r.passes).length;
      allResults.push(r);
      console.log('  [' + (i+1) + '/10][截图] ' + (p===tf?'✅':'❌') + ' ' + r.elapsed + 's | ' + p + '/' + tf + ' | ' + r.verdict.substring(0,25) + ' | A:' + r.scoreA + ' B:' + r.scoreB);
    } catch(e) {
      console.log('  [' + (i+1) + '/10][截图] ❌ CRASH: ' + e.message);
      allResults.push({ round: combo.round, type: '截图', elapsed: '0', error: e.message });
    }
  }

  // 5 轮视频模拟
  for (var j = 0; j < 5; j++) {
    var combo = COMBOS[j];
    try {
      var r = await runVideoSimRound(combo, j);
      var p = Object.values(r.passes).filter(function(v){return v;}).length;
      var tf = Object.keys(r.passes).length;
      allResults.push(r);
      console.log('  [' + (j+6) + '/10][视频] ' + (p===tf?'✅':'❌') + ' ' + r.elapsed + 's | ' + p + '/' + tf + ' | ' + r.verdict.substring(0,25) + ' | A:' + r.scoreA + ' B:' + r.scoreB);
    } catch(e) {
      console.log('  [' + (j+6) + '/10][视频] ❌ CRASH: ' + e.message);
      allResults.push({ round: combo.round, type: '视频', elapsed: '0', error: e.message });
    }
  }

  // 汇总
  var totalElapsed = ((Date.now()-totalStart)/1000).toFixed(0);
  var passedAll = allResults.every(function(r) { return !r.error; });
  var avgTime = (allResults.filter(function(r){return parseFloat(r.elapsed)>0}).reduce(function(s,r){return s+parseFloat(r.elapsed)},0) / allResults.filter(function(r){return parseFloat(r.elapsed)>0}).length).toFixed(1);

  console.log('\n' + '═'.repeat(50));
  console.log('  汇总');
  console.log('═'.repeat(50));
  console.log('  截图: ' + allResults.slice(0,5).filter(function(r){return !r.error;}).length + '/5 通过');
  console.log('  视频: ' + allResults.slice(5,10).filter(function(r){return !r.error;}).length + '/5 通过');
  console.log('  总耗时: ' + totalElapsed + 's | 平均: ' + avgTime + 's/轮');
  console.log('  最终: ' + (passedAll ? '✅ 全部通过' : '❌ 有失败'));

  fs.writeFileSync(TEST_FILE, JSON.stringify({ results: allResults, summary: { total: totalElapsed+'s', avg: avgTime+'s', passed: passedAll, videoFile: videoCheck, ocrApi: ocrCheck } }, null, 2), 'utf8');
  console.log('  详情: ' + TEST_FILE);
}

main().catch(function(e) { console.error('FATAL:', e.message); fs.writeFileSync(TEST_FILE, JSON.stringify({error: e.message}), 'utf8'); });
