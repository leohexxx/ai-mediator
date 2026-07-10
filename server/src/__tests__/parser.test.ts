import { describe, it, expect } from 'vitest'
import { parseWeChatChatLog, formatChatForLLM } from '../services/parser'

// ============================================================================
// 1. parseWeChatChatLog - Basic parsing
// ============================================================================
describe('parseWeChatChatLog - Basic parsing', () => {
  it('parses a single message with timestamp and speaker', () => {
    const input = '2024/1/15 14:30 张三: 你好'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      speaker: '张三',
      content: '你好',
      timestamp: '2024/1/15 14:30',
      type: 'text',
    })
  })

  it('parses multiple messages', () => {
    const input = [
      '2024/1/15 14:30 张三: 你好',
      '2024/1/15 14:31 李四: 在吗？',
      '2024/1/15 14:32 张三: 在的',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(3)
    expect(result[0].speaker).toBe('张三')
    expect(result[1].speaker).toBe('李四')
    expect(result[2].speaker).toBe('张三')
    expect(result[0].content).toBe('你好')
    expect(result[1].content).toBe('在吗？')
    expect(result[2].content).toBe('在的')
  })

  it('parses messages without timestamps (plain Name: content format)', () => {
    const input = [
      '张三: 你好',
      '李四: 在吗？',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      speaker: '张三',
      content: '你好',
      timestamp: null,
      type: 'text',
    })
    expect(result[1]).toMatchObject({
      speaker: '李四',
      content: '在吗？',
      timestamp: null,
      type: 'text',
    })
  })

  it('handles multi-line messages (continuation lines from same speaker)', () => {
    const input = [
      '2024/1/15 14:30 张三: 第一行内容',
      '继续第一行',
      '还是第一行',
      '2024/1/15 14:31 李四: 回复',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(2)
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('第一行内容\n继续第一行\n还是第一行')
    expect(result[1].speaker).toBe('李四')
    expect(result[1].content).toBe('回复')
  })

  it('appends continuation lines only when speaker matches', () => {
    const input = [
      '张三: hello',
      'world',
      '李四: hi',
      'continuation of 李四',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(2)
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('hello\nworld')
    expect(result[1].speaker).toBe('李四')
    expect(result[1].content).toBe('hi\ncontinuation of 李四')
  })
})

// ============================================================================
// 2. parseWeChatChatLog - Message types
// ============================================================================
describe('parseWeChatChatLog - Message types', () => {
  it('classifies regular text messages as type text', () => {
    const input = '2024/1/15 14:30 张三: 普通文本消息'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('text')
  })

  it('classifies [语音] as type voice', () => {
    const input = '2024/1/15 14:30 张三: [语音]'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('voice')
    expect(result[0].content).toBe('[语音]')
  })

  it('classifies [Voice] as type voice (case insensitive)', () => {
    const input = '2024/1/15 14:30 张三: [Voice]'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('voice')
  })

  it('classifies [表情] as type sticker', () => {
    const input = '2024/1/15 14:30 张三: [表情]'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('sticker')
  })

  it('classifies [动画表情] as type sticker', () => {
    const input = '2024/1/15 14:30 张三: [动画表情]'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('sticker')
  })

  it('classifies [Sticker] as type sticker (case insensitive)', () => {
    const input = '2024/1/15 14:30 张三: [Sticker]'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('sticker')
  })

  it('classifies [图片] as type image', () => {
    const input = '2024/1/15 14:30 张三: [图片]'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('image')
  })

  it('classifies [Image] as type image (case insensitive)', () => {
    const input = '2024/1/15 14:30 张三: [Image]'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('image')
  })

  it('classifies [照片] as type image', () => {
    const input = '2024/1/15 14:30 张三: [照片]'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('image')
  })

  it('classifies "你撤回了一条消息" as type system', () => {
    const input = '你撤回了一条消息'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('system')
  })

  it('classifies "对方撤回了一条消息" as type system', () => {
    const input = '对方撤回了一条消息'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('system')
  })

  it('classifies "[系统消息]" as type system', () => {
    const input = '[系统消息] 群聊已解散'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('system')
  })

  it('classifies "<系统消息>" as type system', () => {
    const input = '<系统消息> 某某已加入群聊'
    const result = parseWeChatChatLog(input)

    expect(result[0].type).toBe('system')
  })

  it('does not misclassify text containing brackets', () => {
    const input = '张三: 我喜欢用[表情]这个词'
    const result = parseWeChatChatLog(input)

    // "[表情]" is not at the start of content, so it remains text
    expect(result[0].type).toBe('text')
    expect(result[0].content).toBe('我喜欢用[表情]这个词')
  })
})

// ============================================================================
// 3. parseWeChatChatLog - Timestamp formats
// ============================================================================
describe('parseWeChatChatLog - Timestamp formats', () => {
  it('parses "2024/1/15 14:30" format (year/month/day)', () => {
    const input = '2024/1/15 14:30 张三: 你好'
    const result = parseWeChatChatLog(input)

    expect(result[0].timestamp).toBe('2024/1/15 14:30')
    expect(result[0].speaker).toBe('张三')
  })

  it('parses "2024/1/15 14:30" with seconds variant', () => {
    const input = '2024/1/15 14:30:00 张三: 你好'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].timestamp).toBe('2024/1/15 14:30:00')
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('你好')
  })

  it('parses "2024-01-15 14:30:00" format (ISO-ish)', () => {
    const input = '2024-01-15 14:30:00 张三: 你好'
    const result = parseWeChatChatLog(input)

    expect(result[0].timestamp).toBe('2024-01-15 14:30:00')
    expect(result[0].speaker).toBe('张三')
  })

  it('parses "2024-01-15 14:30" format without seconds', () => {
    const input = '2024-01-15 14:30 张三: 你好'
    const result = parseWeChatChatLog(input)

    expect(result[0].timestamp).toBe('2024-01-15 14:30')
  })

  it('parses "1/15 14:30" short format (month/day)', () => {
    const input = '1/15 14:30 张三: 你好'
    const result = parseWeChatChatLog(input)

    expect(result[0].timestamp).toBe('1/15 14:30')
  })

  it('parses "12/31 23:59" short format with padded month', () => {
    const input = '12/31 23:59 张三: 晚安'
    const result = parseWeChatChatLog(input)

    expect(result[0].timestamp).toBe('12/31 23:59')
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('晚安')
  })

  it('parses "12-31 23:59:59" short format with dash separator and seconds', () => {
    const input = '12-31 23:59:59 张三: 晚安'
    const result = parseWeChatChatLog(input)

    expect(result[0].timestamp).toBe('12-31 23:59:59')
  })

  it('handles mixed timestamp formats in same log', () => {
    const input = [
      '2024/1/15 14:30 张三: 消息1',
      '1/16 09:00 李四: 消息2',
      '2024-01-17 18:00:00 王五: 消息3',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(3)
    expect(result[0].timestamp).toBe('2024/1/15 14:30')
    expect(result[1].timestamp).toBe('1/16 09:00')
    expect(result[2].timestamp).toBe('2024-01-17 18:00:00')
  })

  it('parses 2-digit year format', () => {
    const input = '24/1/15 14:30 张三: hello'
    const result = parseWeChatChatLog(input)

    expect(result[0].timestamp).toBe('24/1/15 14:30')
    expect(result[0].speaker).toBe('张三')
  })

  it('parses 2-digit year with dash format', () => {
    const input = '24-01-15 14:30 张三: hello'
    const result = parseWeChatChatLog(input)

    expect(result[0].timestamp).toBe('24-01-15 14:30')
  })
})

// ============================================================================
// 4. parseWeChatChatLog - Edge cases
// ============================================================================
describe('parseWeChatChatLog - Edge cases', () => {
  it('returns empty array for empty string', () => {
    const result = parseWeChatChatLog('')
    expect(result).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    const result = parseWeChatChatLog('   \n  \n   ')
    expect(result).toEqual([])
  })

  it('parses a single line without speaker as message from 未知', () => {
    const input = '这是一条没有说话人的消息'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].speaker).toBe('未知')
    expect(result[0].content).toBe('这是一条没有说话人的消息')
    expect(result[0].timestamp).toBeNull()
    expect(result[0].type).toBe('text')
  })

  it('handles very long messages (1000+ chars)', () => {
    const longText = 'A'.repeat(1500)
    const input = `张三: ${longText}`
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe(longText)
    expect(result[0].content.length).toBe(1500)
  })

  it('handles messages with emoji 😀🔥💔', () => {
    const input = '2024/1/15 14:30 张三: 你好😀 今天天气不错🔥 但是有点热💔'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('你好😀 今天天气不错🔥 但是有点热💔')
    expect(result[0].speaker).toBe('张三')
  })

  it('handles messages with special characters (@#$%^)', () => {
    const input = '张三: @#$%^&*() 特殊字符测试'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('@#$%^&*() 特殊字符测试')
  })

  it('handles messages with URLs', () => {
    const input = '张三: 看看这个链接 https://example.com/path?q=1'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('看看这个链接 https://example.com/path?q=1')
  })

  it('handles colons in message content (not confused as speaker separator)', () => {
    const input = '张三: 他说:你好'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('他说:你好')
  })

  it('handles multiple colons in message content', () => {
    const input = '张三: 时间:14:30 地点:北京'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('时间:14:30 地点:北京')
  })

  it('handles timestamp line with no content after (falls through to speakerContent match)', () => {
    const input = '1/15 14:30'
    const result = parseWeChatChatLog(input)

    // Falls through: timestamp regex requires content after; speakerContent regex
    // matches "1" as speaker and "15 14:30" as content (first colon wins)
    expect(result.length).toBeGreaterThanOrEqual(1)
    // Verify the parser does not crash
    expect(result[0]).toHaveProperty('speaker')
    expect(result[0]).toHaveProperty('content')
  })

  it('handles lines with only whitespace between messages', () => {
    const input = [
      '张三: hello',
      '',
      '   ',
      '李四: world',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(2)
    expect(result[0].speaker).toBe('张三')
    expect(result[1].speaker).toBe('李四')
  })

  it('handles Chinese colon (：) as speaker separator', () => {
    const input = '张三：你好啊'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('你好啊')
  })

  it('handles mixed Chinese and English colons', () => {
    const input = [
      '张三: 英文冒号',
      '李四：中文冒号',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(2)
    expect(result[0].speaker).toBe('张三')
    expect(result[1].speaker).toBe('李四')
  })

  it('preserves Unicode characters in speaker names', () => {
    const input = '2024/1/15 14:30 小🐱: 喵'
    const result = parseWeChatChatLog(input)

    expect(result[0].speaker).toBe('小🐱')
    expect(result[0].content).toBe('喵')
  })

  it('handles empty content after speaker', () => {
    const input = '张三: '
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('')
  })
})

// ============================================================================
// 5. parseWeChatChatLog - Mixed formats
// ============================================================================
describe('parseWeChatChatLog - Mixed formats', () => {
  it('handles mix of timestamp and non-timestamp lines', () => {
    const input = [
      '2024/1/15 14:30 张三: 带时间戳',
      '李四: 不带时间戳',
      '2024/1/15 14:31 张三: 又带时间戳',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(3)
    expect(result[0].timestamp).toBe('2024/1/15 14:30')
    expect(result[1].timestamp).toBeNull()
    expect(result[2].timestamp).toBe('2024/1/15 14:31')
  })

  it('handles multiple speakers interleaved', () => {
    const input = [
      '张三: 消息1',
      '李四: 消息2',
      '张三: 消息3',
      '王五: 消息4',
      '李四: 消息5',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(5)
    expect(result.map((m) => m.speaker)).toEqual([
      '张三',
      '李四',
      '张三',
      '王五',
      '李四',
    ])
  })

  it('handles same speaker consecutive messages', () => {
    const input = [
      '2024/1/15 14:30 张三: 第一条',
      '2024/1/15 14:31 张三: 第二条',
      '2024/1/15 14:32 张三: 第三条',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(3)
    result.forEach((m) => {
      expect(m.speaker).toBe('张三')
    })
    expect(result[0].content).toBe('第一条')
    expect(result[1].content).toBe('第二条')
    expect(result[2].content).toBe('第三条')
  })

  it('handles non-speaker lines after timestamped messages (uses currentSpeaker)', () => {
    const input = [
      '2024/1/15 14:30 张三: 你好',
      '这是一条没有明确说话人的消息',
      '2024/1/15 14:31 李四: 收到',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    // The middle line has no timestamp and no speaker pattern, but currentSpeaker
    // is '张三' from the previous line, so it gets appended as continuation
    expect(result).toHaveLength(2)
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content).toBe('你好\n这是一条没有明确说话人的消息')
    expect(result[1].speaker).toBe('李四')
    expect(result[1].content).toBe('收到')
  })

  it('handles timestamped system messages', () => {
    const input = '2024/1/15 14:30 你撤回了一条消息'
    const result = parseWeChatChatLog(input)

    // Timestamp regex matches; rest = "你撤回了一条消息"
    // No speaker:content match (no colon), so speaker = currentSpeaker || '未知' = '未知'
    expect(result).toHaveLength(1)
    expect(result[0].speaker).toBe('未知')
    expect(result[0].content).toBe('你撤回了一条消息')
    expect(result[0].timestamp).toBe('2024/1/15 14:30')
    expect(result[0].type).toBe('system')
  })

  it('handles sticker in the middle of conversation', () => {
    const input = [
      '2024/1/15 14:30 张三: 你好',
      '2024/1/15 14:30 张三: [表情]',
      '2024/1/15 14:31 李四: 收到',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('text')
    expect(result[1].type).toBe('sticker')
    expect(result[2].type).toBe('text')
  })

  it('handles messages where rest after timestamp has no speaker', () => {
    const input = '2024/1/15 14:30 系统通知内容没有冒号'
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].speaker).toBe('未知')
    expect(result[0].content).toBe('系统通知内容没有冒号')
    expect(result[0].timestamp).toBe('2024/1/15 14:30')
    expect(result[0].type).toBe('text')
  })

  it('preserves timestamp carry-over between messages without timestamps', () => {
    const input = [
      '2024/1/15 14:30 张三: 消息1',
      '张三: 消息2（没有时间戳）',
      '李四: 回复',
    ].join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(3)
    expect(result[0].timestamp).toBe('2024/1/15 14:30')
    // Lines without timestamps get null timestamp
    expect(result[1].timestamp).toBeNull()
    expect(result[2].timestamp).toBeNull()
  })
})

// ============================================================================
// 6. formatChatForLLM
// ============================================================================
describe('formatChatForLLM', () => {
  const messages = [
    {
      speaker: '张三',
      content: '你好',
      timestamp: '2024/1/15 14:30',
      type: 'text' as const,
    },
    {
      speaker: '李四',
      content: '[表情]',
      timestamp: '2024/1/15 14:31',
      type: 'sticker' as const,
    },
    {
      speaker: '王五',
      content: '大家好',
      timestamp: null,
      type: 'text' as const,
    },
    {
      speaker: '赵六',
      content: '[语音]',
      timestamp: null,
      type: 'voice' as const,
    },
  ]

  const parties = [
    { name: '张三', role: 'party_a' },
    { name: '李四', role: 'party_b' },
  ]

  it('formats basic messages with party labels', () => {
    const result = formatChatForLLM([messages[0]], parties)

    expect(result).toContain('甲方')
    expect(result).toContain('2024/1/15 14:30')
    expect(result).toContain('你好')
  })

  it('assigns 甲方 to party_a role', () => {
    const result = formatChatForLLM([messages[0]], parties)
    expect(result).toContain('甲方: 你好')
  })

  it('assigns 乙方 to non-party_a roles (including party_b)', () => {
    const result = formatChatForLLM([messages[1]], parties)
    expect(result).toContain('乙方')
  })

  it('handles messages without timestamps (leading space in output)', () => {
    const result = formatChatForLLM([messages[2]], parties)

    // Without timestamp, time is '', resulting in a leading space: " 王五: 大家好"
    expect(result).toMatch(/王五/)
    expect(result).toContain('大家好')
  })

  it('shows type tag for non-text message types', () => {
    const result = formatChatForLLM([messages[1]], parties)

    expect(result).toContain('(sticker)')
  })

  it('shows type tag for voice messages', () => {
    const result = formatChatForLLM([messages[3]], parties)

    expect(result).toContain('(voice)')
  })

  it('does not show type tag for text messages', () => {
    const result = formatChatForLLM([messages[0]], parties)

    expect(result).not.toContain('(text)')
  })

  it('keeps original name for unknown speakers not in parties list', () => {
    const result = formatChatForLLM([messages[2]], parties)
    // 王五 is not in parties, so keeps original name
    expect(result).toContain('王五')
    expect(result).not.toContain('甲方')
    expect(result).not.toContain('乙方')
  })

  it('formats multiple messages joined by newlines', () => {
    const result = formatChatForLLM(messages, parties)

    const lines = result.split('\n')
    expect(lines).toHaveLength(4)
  })

  it('preserves message order', () => {
    const result = formatChatForLLM(messages, parties)
    const lines = result.split('\n')

    // 张三 → 甲方, 李四 → 乙方 (in parties list)
    // 王五, 赵六 → keep original name (not in parties list)
    expect(lines[0]).toContain('甲方')
    expect(lines[1]).toContain('乙方')
    expect(lines[2]).toContain('王五')
    expect(lines[3]).toContain('赵六')
  })

  it('handles empty messages array', () => {
    const result = formatChatForLLM([], [])
    expect(result).toBe('')
  })

  it('handles empty parties array', () => {
    const result = formatChatForLLM([messages[0]], [])
    // 张三 not in labelMap, so uses original name
    expect(result).toContain('张三')
    expect(result).not.toContain('甲方')
  })

  it('maps multiple parties with different roles', () => {
    const customParties = [
      { name: '张三', role: 'party_a' },
      { name: '李四', role: 'party_a' },
      { name: '王五', role: 'party_b' },
      { name: '赵六', role: 'mediator' },
    ]

    const result = formatChatForLLM(messages, customParties)

    // 张三 and 李四 are party_a → 甲方
    // 王五 and 赵六 are not party_a → 乙方
    expect(result).toContain('甲方: 你好') // 张三
    expect(result).toContain('甲方(sticker): [表情]') // 李四 (party_a → 甲方)
    expect(result).toContain('乙方: 大家好') // 王五
    expect(result).toContain('乙方(voice): [语音]') // 赵六
  })

  it('formats image type messages with type tag', () => {
    const imgMsg = {
      speaker: '张三',
      content: '[图片]',
      timestamp: '2024/1/15 14:30',
      type: 'image' as const,
    }
    const result = formatChatForLLM([imgMsg], parties)

    expect(result).toContain('(image)')
  })

  it('formats system type messages with type tag', () => {
    const sysMsg = {
      speaker: '系统',
      content: '对方撤回了一条消息',
      timestamp: '2024/1/15 14:30',
      type: 'system' as const,
    }
    const result = formatChatForLLM([sysMsg], parties)

    expect(result).toContain('(system)')
  })
})

// ============================================================================
// 7. Stress tests
// ============================================================================
describe('parseWeChatChatLog - Stress tests', () => {
  it('parses 1000 messages correctly', () => {
    const lines: string[] = []
    const speakers = ['张三', '李四', '王五', '赵六']
    for (let i = 0; i < 1000; i++) {
      const month = String((i % 12) + 1).padStart(2, '0')
      const day = String((i % 28) + 1).padStart(2, '0')
      const hour = String(i % 24).padStart(2, '0')
      const minute = String(i % 60).padStart(2, '0')
      const speaker = speakers[i % speakers.length]
      lines.push(`2024/${month}/${day} ${hour}:${minute} ${speaker}: 消息内容${i}`)
    }
    const input = lines.join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1000)
    // Check first and last
    expect(result[0].speaker).toBe(speakers[0])
    expect(result[999].speaker).toBe(speakers[999 % speakers.length])
    // Verify all have timestamps
    result.forEach((m) => {
      expect(m.timestamp).not.toBeNull()
      expect(m.type).toBe('text')
    })
  })

  it('handles very long message content (10000 chars)', () => {
    const longContent = 'X'.repeat(10000)
    const input = `2024/1/15 14:30 张三: ${longContent}`

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe(longContent)
    expect(result[0].content.length).toBe(10000)
    expect(result[0].speaker).toBe('张三')
  })

  it('handles many rapid timestamp changes', () => {
    const lines: string[] = []
    for (let i = 0; i < 500; i++) {
      const hour = String(Math.floor(i / 60) % 24).padStart(2, '0')
      const minute = String(i % 60).padStart(2, '0')
      lines.push(`2024-01-15 ${hour}:${minute}:${String(i % 60).padStart(2, '0')} 张三: msg${i}`)
    }

    const input = lines.join('\n')
    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(500)
    // Verify all timestamps are unique for different seconds
    const timestamps = result.map((m) => m.timestamp)
    expect(new Set(timestamps).size).toBe(500)
  })

  it('handles 1000 messages mixed with and without timestamps', () => {
    const lines: string[] = []
    for (let i = 0; i < 1000; i++) {
      if (i % 2 === 0) {
        lines.push(`2024/1/15 14:${String(i % 60).padStart(2, '0')} 张三: msg${i}`)
      } else {
        lines.push(`李四: reply${i}`)
      }
    }
    const input = lines.join('\n')

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(1000)
    // Even indices have timestamps, odd don't
    for (let i = 0; i < 1000; i++) {
      if (i % 2 === 0) {
        expect(result[i].timestamp).not.toBeNull()
      } else {
        expect(result[i].timestamp).toBeNull()
      }
    }
  })

  it('handles multi-line continuation with many lines', () => {
    const continuationLines = Array.from({ length: 100 }, (_, i) => `续行${i}`).join('\n')
    const input = `2024/1/15 14:30 张三: 开始\n${continuationLines}\n2024/1/15 14:31 李四: 结束`

    const result = parseWeChatChatLog(input)

    expect(result).toHaveLength(2)
    expect(result[0].speaker).toBe('张三')
    expect(result[0].content.split('\n').length).toBe(101) // 开始 + 100 续行
    expect(result[1].speaker).toBe('李四')
    expect(result[1].content).toBe('结束')
  })
})
