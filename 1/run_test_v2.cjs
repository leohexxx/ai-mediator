var fs = require('fs');
var parser = require('../cloudfunctions/common/parser');
var llm = require('../cloudfunctions/common/llm');

async function main() {
  var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
  var messages = parser.parseWeChatChatLog(ocrText);
  console.log('解析到 ' + messages.length + ' 条消息');

  var parties = [{ name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' }];
  var formatted = parser.formatChatForLLM(messages, parties);

  // 模拟带性格信息的 caseContext
  var caseContext = '关系: 情侣\n案例: 恋爱沟通纠纷\n模式: 单人分析\n\n性格信息:\n  甲方: MBTI: INFJ（提倡者型：理想主义、深富同理心，对关系质量要求极高，渴望深度连接，但容易因期望落差而受伤）\n    星座: 巨蟹座 - 敏感、念旧、情绪化，冲突中容易受伤和退缩，需要情感安全感\n  乙方: MBTI: ISTP（鉴赏家型：冷静、务实、喜欢动手解决具体问题，在关系中不善言辞和情感表达，需要对方理解其"行动即关心"的方式）\n    星座: 摩羯座 - 务实、隐忍、责任感强，冲突中倾向于压抑情绪，用行动而非语言表达\n  提示: 结合双方的 MBTI 类型和星座属性，分析性格差异如何影响他们的沟通方式和冲突模式。';

  console.log('=== LLM 分析中 ===');
  var startTime = Date.now();

  var result = await llm.analyzeChat(formatted, parties, caseContext, function(step, progress) {
    console.log('  [' + progress + '%] ' + step);
  });

  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=== 完成! ' + elapsed + 's ===\n');

  // 重点看性格分析部分
  if (result.detailedAnalysis && result.detailedAnalysis.characters) {
    console.log('【性格分析】');
    for (var i = 0; i < result.detailedAnalysis.characters.length; i++) {
      var c = result.detailedAnalysis.characters[i];
      console.log('\n' + c.name + '（' + c.role + '）：');
      console.log('  性格: ' + (c.personality || '').substring(0, 200));
      console.log('  沟通: ' + (c.communicationStyle || '').substring(0, 150));
    }
  }

  if (result.coreConclusion) {
    var cc = result.coreConclusion;
    console.log('\n【核心结论】');
    console.log('  判定: ' + (cc.overallWinner || cc.verdict));
    console.log('  ' + (cc.oneLineVerdict || cc.reason || '').substring(0, 200));
  }

  fs.writeFileSync('1/_analysis_v2_result.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('\n完整结果: 1/_analysis_v2_result.json');
}
main().catch(function(e) { console.error(e.message); });
