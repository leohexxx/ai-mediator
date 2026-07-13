var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

async function main() {
  var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
  console.log('=== 阶段 2a: 解析 OCR 文本 ===');

  var messages = parser.parseWeChatChatLog(ocrText);
  console.log('解析到 ' + messages.length + ' 条消息\n');

  // Show first 5 parsed messages
  for (var i = 0; i < Math.min(5, messages.length); i++) {
    var m = messages[i];
    console.log('  [' + i + '] sender=' + m.sender + ' | ts=' + m.timestamp + ' | ' + (m.content || '').substring(0, 80));
  }

  console.log('\n=== 阶段 2b: LLM 分析 ===');

  var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
  var formatted = parser.formatChatForLLM(messages, parties);
  console.log('格式化后长度: ' + formatted.length + ' 字');

  var caseContext = '关系: 情侣\n案例: 恋爱沟通纠纷\n模式: 单人分析';

  var startTime = Date.now();
  var result = await llm.analyzeChat(formatted, parties, caseContext, function(step, progress) {
    console.log('  [' + progress + '%] ' + step);
  });
  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Save full result immediately
  fs.writeFileSync('1/_analysis_result.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('\n=== 分析完成! 耗时: ' + elapsed + 's ===');
  console.log('完整结果: 1/_analysis_result.json (' + JSON.stringify(result).length + ' 字符)\n');

  // Print summary
  console.log('顶层字段: ' + Object.keys(result).join(', '));

  var cc = result.coreConclusion;
  if (cc) {
    console.log('\n--- 核心结论 ---');
    console.log('字段: ' + Object.keys(cc).join(', '));
    console.log(JSON.stringify(cc, null, 2));
  }

  if (result.evidenceWeights) {
    console.log('\n--- 关键证据 (' + result.evidenceWeights.length + ') ---');
    console.log(JSON.stringify(result.evidenceWeights.slice(0, 3), null, 2));
  }

  if (result.mediationStrategy) {
    console.log('\n--- 调解策略 (' + result.mediationStrategy.length + ') ---');
    var s = result.mediationStrategy[0];
    console.log('type:', typeof s);
    console.log(JSON.stringify(s, null, 2));
  }

  if (result.advice) {
    console.log('\n--- 建议 ---');
    console.log(JSON.stringify(result.advice, null, 2).substring(0, 600));
  }

  if (result.detailedAnalysis) {
    console.log('\n--- 详细分析 ---');
    console.log(JSON.stringify(result.detailedAnalysis, null, 2).substring(0, 600));
  }
}

main().catch(function(e) { console.error('失败:', e.message); });
