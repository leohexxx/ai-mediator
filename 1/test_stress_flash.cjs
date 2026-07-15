// 12 并发压测 Flash，找单 key 限流上限
// 用法: node --env-file=server/.env 1/test_stress_flash.cjs
var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
var messages = parser.parseWeChatChatLog(ocrText);
var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
var formatted = parser.formatChatForLLM(messages, parties);
var CTX = '关系: 情侣\n性格信息:\n  甲方: MBTI: INFJ / 巨蟹座\n  乙方: MBTI: ISTP / 摩羯座';

function runOne(i) {
  var t = Date.now();
  return llm.analyzeChatStage('core', formatted, parties, CTX).then(function (r) {
    return { i: i, elapsed: ((Date.now() - t) / 1000).toFixed(1), ok: !!(r && r.coreConclusion && r.coreConclusion.oneLineVerdict), err: '' };
  }).catch(function (e) {
    return { i: i, elapsed: ((Date.now() - t) / 1000).toFixed(1), ok: false, err: (e.message || '').substring(0, 80) };
  });
}

async function main() {
  process.env.LLM_MODEL = 'deepseek-v4-flash';
  var N = 12;
  console.log('=== Flash ' + N + ' 并发压测 ===');
  var t0 = Date.now();
  var results = await Promise.all(Array.from({ length: N }, function (_, i) { return runOne(i); }));
  var total = ((Date.now() - t0) / 1000).toFixed(1);
  results.forEach(function (r) {
    console.log('  [' + (r.i + 1) + '] ' + r.elapsed + 's ' + (r.ok ? '✅' : '❌ ' + r.err));
  });
  var ok = results.filter(function (r) { return r.ok; }).length;
  var avg = (results.reduce(function (s, r) { return s + parseFloat(r.elapsed); }, 0) / N).toFixed(1);
  var rateLimited = results.filter(function (r) { return /rate|429|limit|频|busy|too many/i.test(r.err); }).length;
  console.log('\n  总耗时: ' + total + 's | 成功 ' + ok + '/' + N + ' | 平均 ' + avg + 's | 限流错误 ' + rateLimited);
}
main().catch(function (e) { console.error('崩溃:', e.message); });
