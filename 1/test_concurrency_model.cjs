// ═══════════════════════════════════════════════
// 并发 & 模型对比测试
// 1) deepseek-chat(V3/Flash) vs deepseek-reasoner(R1/Pro) 单次速度
// 2) deepseek-chat 5 并发：是否变慢/限流(429)
// 用法: node --env-file=server/.env 1/test_concurrency_model.cjs
// ═══════════════════════════════════════════════
var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
var messages = parser.parseWeChatChatLog(ocrText);
var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
var formatted = parser.formatChatForLLM(messages, parties);
var CTX = '关系: 情侣\n性格信息:\n  甲方: MBTI: INFJ / 巨蟹座\n  乙方: MBTI: ISTP / 摩羯座';

function time() { return Date.now(); }
function sec(t) { return ((Date.now() - t) / 1000).toFixed(1); }

async function runCoreWithModel(model) {
  process.env.LLM_MODEL = model;
  var t = time();
  try {
    var r = await llm.analyzeChatStage('core', formatted, parties, CTX);
    var ok = !!(r && r.coreConclusion && r.coreConclusion.oneLineVerdict);
    return { model: model, elapsed: sec(t), ok: ok, err: '' };
  } catch (e) {
    return { model: model, elapsed: sec(t), ok: false, err: (e.message || '').substring(0, 80) };
  }
}

async function main() {
  console.log('解析: ' + messages.length + ' 条消息, ' + formatted.length + ' 字\n');

  // 1) 模型对比
  console.log('=== 1) 模型对比（单次 core 阶段）===');
  var pro = await runCoreWithModel('deepseek-v4-pro');
  console.log('  deepseek-v4-pro   (Pro)  : ' + pro.elapsed + 's  ' + (pro.ok ? '✅' : '❌ ' + pro.err));
  var flash = await runCoreWithModel('deepseek-v4-flash');
  console.log('  deepseek-v4-flash (Flash): ' + flash.elapsed + 's  ' + (flash.ok ? '✅' : '❌ ' + flash.err));

  // 2) 并发测试（用 Flash，更快更适合并发）
  console.log('\n=== 2) deepseek-v4-flash 5 并发 ===');
  process.env.LLM_MODEL = 'deepseek-v4-flash';
  var t0 = time();
  var tasks = [];
  for (var i = 0; i < 5; i++) tasks.push(runCoreWithModel('deepseek-v4-flash'));
  var results = await Promise.all(tasks);
  var total = sec(t0);
  results.forEach(function (r, i) {
    console.log('  [并发' + (i + 1) + '] ' + r.elapsed + 's ' + (r.ok ? '✅' : '❌ ' + r.err));
  });
  var okCount = results.filter(function (r) { return r.ok; }).length;
  var avg = (results.reduce(function (s, r) { return s + parseFloat(r.elapsed); }, 0) / results.length).toFixed(1);
  console.log('  并发总耗时: ' + total + 's | 成功 ' + okCount + '/5 | 平均 ' + avg + 's');
  var rateLimited = results.some(function (r) { return /rate|429|limit|频|busy/i.test(r.err); });
  console.log('  是否触发限流: ' + (rateLimited ? '⚠️ 是' : '否'));

  // 3) 结论
  console.log('\n=== 3) 结论 ===');
  console.log('  Pro vs Flash: ' + pro.elapsed + 's vs ' + flash.elapsed + 's');
  console.log('  Flash 5并发平均 ' + avg + 's vs 单次 ' + flash.elapsed + 's → ' +
    (parseFloat(avg) > parseFloat(flash.elapsed) * 1.4 ? '并发明显变慢(排队/限流)' : '并发无显著变慢'));
}
main().catch(function (e) { console.error('崩溃:', e.message); process.exit(1); });
