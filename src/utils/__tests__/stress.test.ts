import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveCase, getCase, getAllCases, deleteCase } from '../storage'
import type { Case, Evidence, ChatMessage, Analysis } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uniqueCounter = 0

function makeCase(id: string, title: string): Case {
  return {
    id,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parties: [],
    evidence: [],
    rawText: '',
    analysis: null,
    chatHistory: [],
  }
}

function makeEvidence(id: string): Evidence {
  return {
    id,
    type: 'screenshot',
    source: 'party_a',
    fileName: `${id}.png`,
    extractedText: `Evidence text for ${id}`,
    uploadedAt: new Date().toISOString(),
  }
}

function makeChatMessage(id: string): ChatMessage {
  return {
    id,
    role: id.includes('user') ? 'user' : 'assistant',
    content: `Chat message content for ${id}`,
    timestamp: new Date().toISOString(),
  }
}

function makeAnalysis(caseId: string): Analysis {
  return {
    id: `analysis-${caseId}`,
    caseId,
    createdAt: new Date().toISOString(),
    schemaVersion: 'v2',
    coreConclusion: {
      overallWinner: 'b',
      scoreA: 40,
      scoreB: 60,
      oneLineVerdict: '沟通不畅导致的误会',
      keyReasons: ['理由1', '理由2', '理由3'],
      recommendedAction: '建议双方加强沟通',
      confidence: 70,
      confidenceReasons: ['证据较为完整'],
    },
    evidenceWeights: [],
    emotionCurve: [],
    mediationStrategy: [],
    detailedAnalysis: {
      summary: '综合判断总结',
      relationship: '朋友',
      characters: [
        {
          name: '张三',
          role: 'party_a',
          personality: '直率',
          stance: '要求对方道歉',
          emotionalState: '愤怒',
          communicationStyle: '直接表达型',
        },
        {
          name: '李四',
          role: 'party_b',
          personality: '温和',
          stance: '认为自己没错',
          emotionalState: '委屈',
          communicationStyle: '回避型',
        },
      ],
      timeline: [
        {
          timestamp: '2024-01-01 10:00',
          speaker: '张三',
          content: '你怎么能这样',
          emotion: '愤怒',
          significance: '冲突起点',
          isTurningPoint: false,
        },
      ],
      conflicts: [
        {
          topic: '信任问题',
          partyAStance: '张三认为李四不守信用',
          partyBStance: '李四认为有客观原因',
          aiJudgment: '双方都缺乏有效沟通',
          winner: 'tie',
          severity: 'medium',
        },
      ],
    },
    advice: {
      toA: ['建议A1', '建议A2'],
      toB: ['建议B1', '建议B2'],
      toBoth: ['共同建议'],
    },
  }
}

// Clean state: each test uses a unique prefix to avoid collisions.
// We cannot use indexedDB.deleteDatabase here because the storage module
// caches an open DB connection that would block the delete.
// Instead, each test uses uniqueCounter-based IDs for isolation.
beforeEach(() => {
  uniqueCounter++
})

// ============================================================================
// 1. Storage: Bulk operations
// ============================================================================
describe('Storage: Bulk operations', () => {
  it('saves 100 cases, retrieves all, verifies count', async () => {
    const prefix = `bulk-1-${uniqueCounter}-`
    const ids: string[] = []

    for (let i = 0; i < 100; i++) {
      const id = `${prefix}${i}`
      ids.push(id)
      const c = makeCase(id, `批量案件 ${i}`)
      c.createdAt = new Date(2024, 0, i + 1).toISOString()
      await saveCase(c)
    }

    const all = await getAllCases()
    const ours = all.filter((c) => c.id.startsWith(prefix))
    expect(ours).toHaveLength(100)

    // Verify a few random ones
    expect(ours.find((c) => c.id === `${prefix}0`)!.title).toBe('批量案件 0')
    expect(ours.find((c) => c.id === `${prefix}50`)!.title).toBe('批量案件 50')
    expect(ours.find((c) => c.id === `${prefix}99`)!.title).toBe('批量案件 99')
  })

  it('saves 100 cases, deletes 50, verifies 50 remain', async () => {
    const prefix = `bulk-2-${uniqueCounter}-`
    const ids: string[] = []

    // Save 100
    for (let i = 0; i < 100; i++) {
      const id = `${prefix}${i}`
      ids.push(id)
      await saveCase(makeCase(id, `Case ${i}`))
    }

    // Delete even-numbered ones (50 cases)
    for (let i = 0; i < 100; i += 2) {
      await deleteCase(ids[i])
    }

    // Verify remaining
    const all = await getAllCases()
    const ours = all.filter((c) => c.id.startsWith(prefix))
    expect(ours).toHaveLength(50)

    // Verify only odd-indexed ones remain
    for (let i = 0; i < 100; i++) {
      const c = await getCase(ids[i])
      if (i % 2 === 0) {
        expect(c).toBeUndefined()
      } else {
        expect(c).toBeDefined()
        expect(c!.id).toBe(ids[i])
      }
    }
  })

  it('updates a single case 50 times, verifies latest version', async () => {
    const id = `update-${uniqueCounter}`
    const c = makeCase(id, '初始版本')
    await saveCase(c)

    for (let i = 1; i <= 50; i++) {
      const current = await getCase(id)
      current!.title = `更新版本 ${i}`
      current!.rawText = `content-${i}`
      await saveCase(current!)
    }

    const final = await getCase(id)
    expect(final).toBeDefined()
    expect(final!.title).toBe('更新版本 50')
    expect(final!.rawText).toBe('content-50')
  })

  it('saves case with 1000 evidence entries', async () => {
    const id = `large-evidence-${uniqueCounter}`
    const c = makeCase(id, '大量证据案件')

    c.evidence = Array.from({ length: 1000 }, (_, i) => ({
      id: `ev-${i}`,
      type: (['screenshot', 'screen_recording', 'text'] as const)[i % 3],
      source: (['party_a', 'party_b', 'self'] as const)[i % 3],
      fileName: `evidence-${i}.${i % 2 === 0 ? 'png' : 'txt'}`,
      extractedText: `这是第${i}条证据的提取文本内容。包含足够的字符来模拟真实场景。`.repeat(3),
      uploadedAt: new Date(2024, 0, (i % 28) + 1).toISOString(),
    }))

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.evidence).toHaveLength(1000)
    expect(retrieved!.evidence[0].id).toBe('ev-0')
    expect(retrieved!.evidence[500].id).toBe('ev-500')
    expect(retrieved!.evidence[999].id).toBe('ev-999')
    expect(retrieved!.evidence[0].extractedText).toContain('第0条证据')
  })

  it('saves case with 500 chat history messages', async () => {
    const id = `large-chat-${uniqueCounter}`
    const c = makeCase(id, '大量聊天记录案件')

    c.chatHistory = Array.from({ length: 500 }, (_, i) => ({
      id: `msg-${i}`,
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `这是第${i}条聊天消息的内容。用户和AI助手的对话记录。`,
      timestamp: new Date(2024, 0, 1, 0, i).toISOString(),
    }))

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.chatHistory).toHaveLength(500)
    expect(retrieved!.chatHistory[0].id).toBe('msg-0')
    expect(retrieved!.chatHistory[250].id).toBe('msg-250')
    expect(retrieved!.chatHistory[499].id).toBe('msg-499')
    // Verify role alternation
    expect(retrieved!.chatHistory[0].role).toBe('user')
    expect(retrieved!.chatHistory[1].role).toBe('assistant')
  })

  it('handles concurrent save+read (interleave 10 saves with 10 reads)', async () => {
    const prefix = `concurrent-${uniqueCounter}-`
    const operations: Promise<unknown>[] = []

    // Interleave: save, read, save, read, ...
    for (let i = 0; i < 10; i++) {
      const id = `${prefix}${i}`
      // Save
      operations.push(saveCase(makeCase(id, `并发案件 ${i}`)))
      // Read a previously saved case (or the one just saved)
      operations.push((async () => {
        // Small delay to allow save to complete
        await new Promise((r) => setTimeout(r, 5))
        return getCase(id)
      })())
    }

    await Promise.all(operations)

    // Verify all cases were saved
    for (let i = 0; i < 10; i++) {
      const c = await getCase(`${prefix}${i}`)
      expect(c).toBeDefined()
      expect(c!.title).toBe(`并发案件 ${i}`)
    }
  })

  it('saves 200 cases and verifies all are individually retrievable', async () => {
    const prefix = `bulk-3-${uniqueCounter}-`

    for (let i = 0; i < 200; i++) {
      const c = makeCase(`${prefix}${i}`, `Case ${i}`)
      await saveCase(c)
    }

    // Verify random sampling
    for (const idx of [0, 50, 100, 150, 199]) {
      const c = await getCase(`${prefix}${idx}`)
      expect(c).toBeDefined()
      expect(c!.title).toBe(`Case ${idx}`)
    }

    // getAll should include all of them
    const all = await getAllCases()
    const ours = all.filter((c) => c.id.startsWith(prefix))
    expect(ours).toHaveLength(200)
  })
})

// ============================================================================
// 2. Storage: Data integrity
// ============================================================================
describe('Storage: Data integrity', () => {
  it('preserves case with all fields maxed out (long strings everywhere)', async () => {
    const id = `maxed-out-${uniqueCounter}`
    const longText = '长文本'.repeat(2000) // ~8000 chars
    const c: Case = {
      id,
      title: '很长标题'.repeat(100),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parties: [
        { name: 'A'.repeat(100), role: 'party_a' },
        { name: 'B'.repeat(100), role: 'party_b' },
      ],
      evidence: [
        {
          id: 'ev-long',
          type: 'text',
          source: 'party_a',
          fileName: 'F'.repeat(255) + '.txt',
          extractedText: longText,
          uploadedAt: new Date().toISOString(),
        },
      ],
      rawText: longText,
      analysis: makeAnalysis(id),
      chatHistory: [
        {
          id: 'msg-long',
          role: 'user',
          content: longText,
          timestamp: new Date().toISOString(),
        },
      ],
    }

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.title).toBe('很长标题'.repeat(100))
    expect(retrieved!.rawText).toBe(longText)
    expect(retrieved!.parties[0].name.length).toBe(100)
    expect(retrieved!.evidence[0].extractedText).toBe(longText)
    expect(retrieved!.chatHistory[0].content).toBe(longText)
    expect(retrieved!.analysis).toBeDefined()
    expect(retrieved!.analysis!.detailedAnalysis.summary).toBe('综合判断总结')
  })

  it('preserves special Unicode characters in all text fields', async () => {
    const id = `unicode-${uniqueCounter}`
    const unicodeText = 'CJK: 中文日本語한국어 | Arabic: العربية | Emoji: 🎉🔥💔😀✨ | Math: ∑∏∫√∞ | Symbols: ©®™€£¥'

    const c: Case = {
      id,
      title: `🎯 ${unicodeText}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parties: [
        { name: '張三 🐱', role: 'party_a' },
        { name: 'محمد أحمد', role: 'party_b' },
      ],
      evidence: [
        {
          id: 'ev-unicode',
          type: 'text',
          source: 'party_a',
          fileName: '证据文件🎯.txt',
          extractedText: unicodeText,
          uploadedAt: new Date().toISOString(),
        },
      ],
      rawText: `聊天记录:\n張三 🐱: ${unicodeText}\nمحمد أحمد: مرحبا بالعالم 🌍`,
      analysis: {
        ...makeAnalysis(id),
        detailedAnalysis: {
          summary: `分析摘要: ${unicodeText}`,
          relationship: '朋友关系 🤝',
          characters: [
            { name: '張三 🐱', role: 'party_a', personality: '直率 🎯', stance: '要求说明 ∑', emotionalState: '愤怒 😤', communicationStyle: '直接型 🎯' },
            { name: 'محمد أحمد', role: 'party_b', personality: '温和 🌸', stance: '解释 ∫', emotionalState: '平静 😌', communicationStyle: '温和型 🌸' },
          ],
          timeline: [],
          conflicts: [],
        },
        coreConclusion: {
          ...makeAnalysis(id).coreConclusion,
          oneLineVerdict: `裁决: ${unicodeText}`,
          keyReasons: ['理由①', '理由② ∑', '理由③ 🎉'],
        },
        advice: {
          toA: ['建议A: 冷静沟通 😌', '建议A: 换位思考 🔄'],
          toB: ['建议B: 主动说明 📝', '建议B: 表达诚意 💚'],
          toBoth: ['共同建议: 定期交流 🗓️'],
        },
        createdAt: new Date().toISOString(),
      },
      chatHistory: [
        {
          id: 'msg-unicode',
          role: 'user',
          content: `用户问题: ${unicodeText}`,
          timestamp: new Date().toISOString(),
        },
      ],
    }

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.title).toContain('🎯')
    expect(retrieved!.parties[0].name).toBe('張三 🐱')
    expect(retrieved!.parties[1].name).toBe('محمد أحمد')
    expect(retrieved!.evidence[0].extractedText).toContain('∑∏∫√∞')
    expect(retrieved!.rawText).toContain('مرحبا')
    expect(retrieved!.analysis!.detailedAnalysis.summary).toContain('🎉')
    expect(retrieved!.analysis!.detailedAnalysis.characters[1].name).toBe('محمد أحمد')
    expect(retrieved!.analysis!.coreConclusion.keyReasons[1]).toContain('∑')
    expect(retrieved!.analysis!.advice.toBoth[0]).toContain('🗓️')
    expect(retrieved!.chatHistory[0].content).toContain('🎉')
  })

  it('handles save/delete cycle 50 times on same ID without leaks', async () => {
    const id = `cycle-${uniqueCounter}`

    for (let cycle = 0; cycle < 50; cycle++) {
      // Save
      const c = makeCase(id, `循环版本 ${cycle}`)
      c.rawText = `数据内容 循环${cycle}`
      await saveCase(c)

      // Verify it exists
      let retrieved = await getCase(id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.title).toBe(`循环版本 ${cycle}`)

      // Delete
      await deleteCase(id)

      // Verify it's gone
      retrieved = await getCase(id)
      expect(retrieved).toBeUndefined()
    }

    // Final save
    const finalCase = makeCase(id, '最终版本')
    await saveCase(finalCase)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.title).toBe('最终版本')
  })

  it('handles cases with identical timestamps', async () => {
    const prefix = `same-time-${uniqueCounter}-`
    const sameTime = '2024-06-15T12:00:00.000Z'

    for (let i = 0; i < 20; i++) {
      const c = makeCase(`${prefix}${i}`, `同时案件 ${i}`)
      c.createdAt = sameTime
      await saveCase(c)
    }

    // All should be retrievable
    for (let i = 0; i < 20; i++) {
      const c = await getCase(`${prefix}${i}`)
      expect(c).toBeDefined()
      expect(c!.title).toBe(`同时案件 ${i}`)
      expect(c!.createdAt).toBe(sameTime)
    }

    // getAll should return all of them
    const all = await getAllCases()
    const ours = all.filter((c) => c.id.startsWith(prefix))
    expect(ours).toHaveLength(20)
  })

  it('preserves exact field values through many save/read cycles', async () => {
    const id = `precision-${uniqueCounter}`
    const preciseCase: Case = {
      id,
      title: '精确值测试',
      createdAt: '2024-06-15T12:34:56.789Z',
      updatedAt: '2024-06-15T12:34:56.789Z',
      parties: [
        { name: '精确名字1', role: 'party_a' },
        { name: '精确名字2', role: 'party_b' },
      ],
      evidence: [
        {
          id: 'precise-ev-1',
          type: 'screenshot',
          source: 'party_a',
          fileName: 'precise-file.png',
          extractedText: '精确提取文本',
          uploadedAt: '2024-06-15T12:34:56.789Z',
        },
      ],
      rawText: '精确原始文本\n第二行\n第三行',
      analysis: makeAnalysis(id),
      chatHistory: [
        {
          id: 'precise-msg-1',
          role: 'user',
          content: '精确聊天内容',
          timestamp: '2024-06-15T12:34:56.789Z',
        },
      ],
    }

    await saveCase(preciseCase)

    // Read back 10 times and verify each time
    for (let i = 0; i < 10; i++) {
      const retrieved = await getCase(id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.title).toBe('精确值测试')
      expect(retrieved!.createdAt).toBe('2024-06-15T12:34:56.789Z')
      expect(retrieved!.parties[0].name).toBe('精确名字1')
      expect(retrieved!.evidence[0].extractedText).toBe('精确提取文本')
      expect(retrieved!.rawText).toBe('精确原始文本\n第二行\n第三行')
      expect(retrieved!.chatHistory[0].content).toBe('精确聊天内容')
    }
  })
})

// ============================================================================
// 3. Storage: Edge data
// ============================================================================
describe('Storage: Edge data', () => {
  it('handles case with empty evidence but non-null analysis', async () => {
    const id = `edge-1-${uniqueCounter}`
    const c = makeCase(id, '空证据有分析')
    c.evidence = []
    c.analysis = makeAnalysis(id)

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.evidence).toEqual([])
    expect(retrieved!.analysis).not.toBeNull()
    expect(retrieved!.analysis!.detailedAnalysis.summary).toBe('综合判断总结')
  })

  it('handles case with null analysis but non-empty chatHistory', async () => {
    const id = `edge-2-${uniqueCounter}`
    const c = makeCase(id, '无分析有聊天')
    c.analysis = null
    c.chatHistory = [
      {
        id: 'msg-1',
        role: 'user',
        content: '用户消息1',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: '助手回复1',
        timestamp: new Date().toISOString(),
      },
    ]

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.analysis).toBeNull()
    expect(retrieved!.chatHistory).toHaveLength(2)
    expect(retrieved!.chatHistory[0].content).toBe('用户消息1')
    expect(retrieved!.chatHistory[1].content).toBe('助手回复1')
  })

  it('handles very long case title (500 chars)', async () => {
    const id = `edge-3-${uniqueCounter}`
    const longTitle = '长标题测试'.repeat(100) // ~600 chars
    const c = makeCase(id, longTitle.substring(0, 500))

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.title).toBe(longTitle.substring(0, 500))
    expect(retrieved!.title.length).toBe(500)
  })

  it('handles empty string fields everywhere', async () => {
    const id = `edge-4-${uniqueCounter}`
    const c: Case = {
      id,
      title: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parties: [],
      evidence: [],
      rawText: '',
      analysis: null,
      chatHistory: [],
    }

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.title).toBe('')
    expect(retrieved!.parties).toEqual([])
    expect(retrieved!.evidence).toEqual([])
    expect(retrieved!.rawText).toBe('')
    expect(retrieved!.analysis).toBeNull()
    expect(retrieved!.chatHistory).toEqual([])
  })

  it('handles case with only id and no other meaningful data', async () => {
    const id = `edge-5-${uniqueCounter}`
    const c: Case = {
      id,
      title: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parties: [],
      evidence: [],
      rawText: '',
      analysis: null,
      chatHistory: [],
    }

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(id)
  })

  it('handles case with complex nested objects where some sub-fields are empty', async () => {
    const id = `edge-6-${uniqueCounter}`
    const c = makeCase(id, '部分空字段')
    c.analysis = {
      id: `analysis-${id}`,
      caseId: id,
      createdAt: new Date().toISOString(),
      schemaVersion: 'v2',
      coreConclusion: {
        overallWinner: 'tie',
        scoreA: 0,
        scoreB: 0,
        oneLineVerdict: '',
        keyReasons: [],
        recommendedAction: '',
        confidence: 0,
        confidenceReasons: [],
      },
      evidenceWeights: [],
      emotionCurve: [],
      mediationStrategy: [],
      detailedAnalysis: {
        summary: '',
        relationship: '',
        characters: [],
        timeline: [],
        conflicts: [],
      },
      advice: {
        toA: [],
        toB: [],
        toBoth: [],
      },
    }

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.analysis).not.toBeNull()
    expect(retrieved!.analysis!.detailedAnalysis.summary).toBe('')
    expect(retrieved!.analysis!.detailedAnalysis.characters).toEqual([])
    expect(retrieved!.analysis!.coreConclusion.keyReasons).toEqual([])
    expect(retrieved!.analysis!.advice.toA).toEqual([])
  })

  it('saves and retrieves case with analysis verdict scoreA being 0', async () => {
    const id = `edge-7-${uniqueCounter}`
    const c = makeCase(id, '零分案件')
    c.analysis = makeAnalysis(id)
    c.analysis.coreConclusion.scoreA = 0
    c.analysis.coreConclusion.scoreB = 100

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved!.analysis!.coreConclusion.scoreA).toBe(0)
    expect(retrieved!.analysis!.coreConclusion.scoreB).toBe(100)
  })

  it('saves and retrieves case with analysis verdict scoreB being 0', async () => {
    const id = `edge-8-${uniqueCounter}`
    const c = makeCase(id, '满分案件')
    c.analysis = makeAnalysis(id)
    c.analysis.coreConclusion.scoreA = 100
    c.analysis.coreConclusion.scoreB = 0

    await saveCase(c)

    const retrieved = await getCase(id)
    expect(retrieved!.analysis!.coreConclusion.scoreA).toBe(100)
    expect(retrieved!.analysis!.coreConclusion.scoreB).toBe(0)
  })
})
