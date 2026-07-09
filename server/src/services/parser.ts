interface ParsedMessage {
  speaker: string
  content: string
  timestamp: string | null
  type: 'text' | 'voice' | 'sticker' | 'image' | 'system'
}

export function parseWeChatChatLog(rawText: string): ParsedMessage[] {
  const lines = rawText.split('\n').filter((l) => l.trim())
  const messages: ParsedMessage[] = []

  const wechatLineRegex =
    /^(\d{1,2}[-/]\d{1,2}[-/]\s*\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)$/

  const speakerContentRegex = /^(.+?)[：:]\s*(.*)$/

  let currentSpeaker = ''
  let currentTime: string | null = null

  for (const line of lines) {
    const timeMatch = line.match(wechatLineRegex)
    if (timeMatch) {
      currentTime = timeMatch[1].trim()
      const rest = timeMatch[2]
      const scMatch = rest.match(speakerContentRegex)
      if (scMatch) {
        currentSpeaker = scMatch[1].trim()
        const content = scMatch[2].trim()
        messages.push({
          speaker: currentSpeaker,
          content,
          timestamp: currentTime,
          type: classifyMessage(content),
        })
      } else {
        messages.push({
          speaker: currentSpeaker || '未知',
          content: rest,
          timestamp: currentTime,
          type: 'text',
        })
      }
    } else {
      const scMatch = line.match(speakerContentRegex)
      if (scMatch) {
        currentSpeaker = scMatch[1].trim()
        messages.push({
          speaker: currentSpeaker,
          content: scMatch[2].trim(),
          timestamp: null,
          type: classifyMessage(scMatch[2]),
        })
      } else if (currentSpeaker && line.trim()) {
        const lastMsg = messages[messages.length - 1]
        if (lastMsg && lastMsg.speaker === currentSpeaker) {
          lastMsg.content += '\n' + line.trim()
        }
      }
    }
  }

  return messages
}

function classifyMessage(content: string): ParsedMessage['type'] {
  if (/^\[语音\]|^\[Voice\]/i.test(content)) return 'voice'
  if (/^\[表情\]|^\[Sticker\]|^\[动画表情\]/i.test(content)) return 'sticker'
  if (/^\[图片\]|^\[Image\]|^\[照片\]/i.test(content)) return 'image'
  if (/^(你撤回了一条消息|对方撤回了一条消息|[\[<]系统消息)/.test(content))
    return 'system'
  return 'text'
}

export function formatChatForLLM(
  messages: ParsedMessage[],
  parties: { name: string; role: string }[]
): string {
  const labelMap: Record<string, string> = {}
  for (const p of parties) {
    labelMap[p.name] = p.role === 'party_a' ? '甲方' : '乙方'
  }

  return messages
    .map((m) => {
      const label = labelMap[m.speaker] || m.speaker
      const time = m.timestamp ? `[${m.timestamp}]` : ''
      const typeTag = m.type !== 'text' ? `(${m.type})` : ''
      return `${time} ${label}${typeTag}: ${m.content}`
    })
    .join('\n')
}
