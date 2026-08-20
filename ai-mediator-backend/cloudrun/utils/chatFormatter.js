// ═══════════════════════════════════════════════
// 聊天记录解析 + 格式化（复用现有 parser 逻辑）
// ═══════════════════════════════════════════════

/**
 * 解析微信聊天记录文本为结构化消息列表
 */
function parseWeChatChatLog(rawText) {
  var lines = rawText.split('\n').filter(function (l) { return l.trim(); });
  var messages = [];
  var wechatLineRegex = /^((?:\d{2,4}[-/])?\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)$/;
  var speakerContentRegex = /^(.+?)[：:]\s*(.*)$/;
  var currentSpeaker = '';
  var currentTime = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var timeMatch = line.match(wechatLineRegex);
    if (timeMatch) {
      currentTime = timeMatch[1].trim();
      var rest = timeMatch[2];
      var scMatch = rest.match(speakerContentRegex);
      if (scMatch) {
        currentSpeaker = scMatch[1].trim();
        messages.push({ speaker: currentSpeaker, content: scMatch[2].trim(), timestamp: currentTime, type: classify(scMatch[2].trim()) });
      } else {
        messages.push({ speaker: currentSpeaker || '未知', content: rest, timestamp: currentTime, type: classify(rest) });
      }
    } else {
      var sc = line.match(speakerContentRegex);
      if (sc) {
        currentSpeaker = sc[1].trim();
        messages.push({ speaker: currentSpeaker, content: sc[2].trim(), timestamp: null, type: classify(sc[2].trim()) });
      } else if (currentSpeaker && line.trim()) {
        var last = messages[messages.length - 1];
        if (last && last.speaker === currentSpeaker) last.content += '\n' + line.trim();
      } else if (line.trim()) {
        messages.push({ speaker: '未知', content: line.trim(), timestamp: null, type: 'system' });
      }
    }
  }
  return messages;
}

function classify(content) {
  if (/^\[语音\]|^\[Voice\]/i.test(content)) return 'voice';
  if (/^\[表情\]|^\[Sticker\]|^\[动画表情\]/i.test(content)) return 'sticker';
  if (/^\[图片\]|^\[Image\]|^\[照片\]/i.test(content)) return 'image';
  if (/^(你撤回了一条消息|对方撤回了一条消息|[\[<]系统消息)/.test(content)) return 'system';
  return 'text';
}

/**
 * 格式化为 LLM 输入
 */
function formatChatForLLM(messages, parties) {
  var labelMap = {};
  parties.forEach(function (p) { labelMap[p.name] = p.role === 'party_a' ? '甲方' : '乙方'; });
  return messages.map(function (m) {
    var label = labelMap[m.speaker] || m.speaker;
    var time = m.timestamp ? '[' + m.timestamp + ']' : '';
    var typeTag = m.type !== 'text' ? '(' + m.type + ')' : '';
    return time + ' ' + label + typeTag + ': ' + m.content;
  }).join('\n');
}

module.exports = { parseWeChatChatLog: parseWeChatChatLog, formatChatForLLM: formatChatForLLM };
