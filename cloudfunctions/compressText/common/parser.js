// ═══════════════════════════════════════════════
// 微信聊天记录解析器（纯函数，无平台依赖）
// 来源: server/src/services/parser.ts
// ═══════════════════════════════════════════════

/**
 * @typedef {Object} ParsedMessage
 * @property {string} speaker - 说话人
 * @property {string} content - 消息内容
 * @property {string|null} timestamp - 时间戳
 * @property {'text'|'voice'|'sticker'|'image'|'system'} type - 消息类型
 */

/**
 * 分类消息类型
 * @param {string} content
 * @returns {'text'|'voice'|'sticker'|'image'|'system'}
 */
function classifyMessage(content) {
  if (/^\[语音\]|^\[Voice\]/i.test(content)) return 'voice';
  if (/^\[表情\]|^\[Sticker\]|^\[动画表情\]/i.test(content)) return 'sticker';
  if (/^\[图片\]|^\[Image\]|^\[照片\]/i.test(content)) return 'image';
  if (/^(你撤回了一条消息|对方撤回了一条消息|[\[<]系统消息)/.test(content))
    return 'system';
  return 'text';
}

/**
 * 解析微信聊天记录文本，提取结构化消息列表。
 *
 * 支持的格式：
 * - 带时间戳的标准格式：`2024-01-15 14:30 张三: 你好`
 * - 无时间戳的简化格式：`张三: 你好`
 * - 多行消息（同一个人连续发送的后续行）
 *
 * @param {string} rawText - 原始聊天记录文本
 * @returns {ParsedMessage[]} 解析后的消息列表
 */
function parseWeChatChatLog(rawText) {
  const lines = rawText.split('\n').filter(function (l) { return l.trim(); });
  const messages = [];

  const wechatLineRegex =
    /^((?:\d{2,4}[-/])?\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)$/;

  const speakerContentRegex = /^(.+?)[：:]\s*(.*)$/;

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
        var content = scMatch[2].trim();
        messages.push({
          speaker: currentSpeaker,
          content: content,
          timestamp: currentTime,
          type: classifyMessage(content),
        });
      } else {
        messages.push({
          speaker: currentSpeaker || '未知',
          content: rest,
          timestamp: currentTime,
          type: classifyMessage(rest),
        });
      }
    } else {
      var scMatch2 = line.match(speakerContentRegex);
      if (scMatch2) {
        currentSpeaker = scMatch2[1].trim();
        messages.push({
          speaker: currentSpeaker,
          content: scMatch2[2].trim(),
          timestamp: null,
          type: classifyMessage(scMatch2[2]),
        });
      } else if (currentSpeaker && line.trim()) {
        // 检查是否是分隔线或日期标题
        if (/^(={3,}|-{3,}|\*{3,})/.test(line.trim()) || /^\[.*[日月年]]/.test(line.trim())) {
          messages.push({
            speaker: '未知',
            content: line.trim(),
            timestamp: null,
            type: 'system',
          });
        } else {
          var lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.speaker === currentSpeaker) {
            lastMsg.content += '\n' + line.trim();
          }
        }
      } else if (line.trim()) {
        messages.push({
          speaker: '未知',
          content: line.trim(),
          timestamp: null,
          type: classifyMessage(line.trim()),
        });
      }
    }
  }

  return messages;
}

/**
 * 将解析后的消息格式化为适合 LLM 输入的文本。
 *
 * @param {ParsedMessage[]} messages - 消息列表
 * @param {{name: string, role: string}[]} parties - 当事人信息
 * @returns {string} 格式化后的聊天记录文本
 */
function formatChatForLLM(messages, parties) {
  var labelMap = {};
  for (var i = 0; i < parties.length; i++) {
    var p = parties[i];
    labelMap[p.name] = p.role === 'party_a' ? '甲方' : '乙方';
  }

  return messages
    .map(function (m) {
      var label = labelMap[m.speaker] || m.speaker;
      var time = m.timestamp ? '[' + m.timestamp + ']' : '';
      var typeTag = m.type !== 'text' ? '(' + m.type + ')' : '';
      return time + ' ' + label + typeTag + ': ' + m.content;
    })
    .join('\n');
}

module.exports = {
  parseWeChatChatLog: parseWeChatChatLog,
  formatChatForLLM: formatChatForLLM,
};
