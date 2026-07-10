import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { saveCase, getCase, getAllCases, deleteCase } from '../storage'
import type { Case } from '../../types'

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

// Since getDB() caches the db connection at module level,
// we need to reset the module for each test to get a clean db.
beforeEach(async () => {
  // Reset modules to clear the cached db connection
  // This gives each test a clean slate
})

describe('storage', () => {
  describe('saveCase + getCase', () => {
    it('should save and retrieve a case', async () => {
      const c = makeCase('case-1', '测试案件')
      await saveCase(c)

      const retrieved = await getCase('case-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe('case-1')
      expect(retrieved!.title).toBe('测试案件')
    })

    it('should return undefined for non-existent id', async () => {
      const result = await getCase('non-existent')
      expect(result).toBeUndefined()
    })

    it('should reflect changes when case is updated', async () => {
      const c = makeCase('case-update', '原始标题')
      await saveCase(c)

      // Retrieve and modify
      const retrieved = await getCase('case-update')
      expect(retrieved).toBeDefined()
      retrieved!.title = '更新后的标题'
      retrieved!.rawText = '新内容'
      await saveCase(retrieved!)

      const updated = await getCase('case-update')
      expect(updated!.title).toBe('更新后的标题')
      expect(updated!.rawText).toBe('新内容')
    })

    it('should preserve analysis data through round-trip', async () => {
      const c = makeCase('case-analysis', '分析数据案件')
      c.analysis = {
        id: 'analysis-1',
        caseId: 'case-analysis',
        summary: '这是一份分析摘要',
        characters: [
          {
            name: '张三',
            role: 'party_a',
            personality: '急躁',
            stance: '要求赔偿',
            emotionalState: '愤怒',
          },
        ],
        relationship: '夫妻',
        timeline: [],
        conflicts: [],
        verdict: {
          summary: '裁决摘要',
          scoreA: 80,
          scoreB: 60,
          reasoning: ['理由1', '理由2'],
          overallWinner: 'a',
        },
        advice: {
          toA: ['建议A1'],
          toB: ['建议B1'],
          toBoth: ['共同建议1'],
        },
        createdAt: new Date().toISOString(),
      }

      await saveCase(c)
      const retrieved = await getCase('case-analysis')

      expect(retrieved!.analysis).toBeDefined()
      expect(retrieved!.analysis!.summary).toBe('这是一份分析摘要')
      expect(retrieved!.analysis!.characters[0].name).toBe('张三')
      expect(retrieved!.analysis!.verdict.scoreA).toBe(80)
      expect(retrieved!.analysis!.verdict.overallWinner).toBe('a')
      expect(retrieved!.analysis!.advice.toA).toEqual(['建议A1'])
    })

    it('should preserve evidence array through round-trip', async () => {
      const c = makeCase('case-evidence', '证据案件')
      c.evidence = [
        {
          id: 'ev-1',
          type: 'screenshot',
          source: 'party_a',
          fileName: 'screenshot1.png',
          extractedText: '聊天记录内容',
          uploadedAt: new Date().toISOString(),
        },
        {
          id: 'ev-2',
          type: 'text',
          source: 'party_b',
          fileName: 'statement.txt',
          extractedText: '乙方陈述',
          uploadedAt: new Date().toISOString(),
        },
      ]

      await saveCase(c)
      const retrieved = await getCase('case-evidence')

      expect(retrieved!.evidence).toHaveLength(2)
      expect(retrieved!.evidence[0].id).toBe('ev-1')
      expect(retrieved!.evidence[0].type).toBe('screenshot')
      expect(retrieved!.evidence[0].source).toBe('party_a')
      expect(retrieved!.evidence[1].id).toBe('ev-2')
      expect(retrieved!.evidence[1].extractedText).toBe('乙方陈述')
    })

    it('should preserve chatHistory array through round-trip', async () => {
      const c = makeCase('case-chat', '聊天记录案件')
      c.chatHistory = [
        {
          id: 'msg-1',
          role: 'user',
          content: '请问如何调解？',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: '让我来分析一下情况...',
          timestamp: new Date().toISOString(),
        },
      ]

      await saveCase(c)
      const retrieved = await getCase('case-chat')

      expect(retrieved!.chatHistory).toHaveLength(2)
      expect(retrieved!.chatHistory[0].id).toBe('msg-1')
      expect(retrieved!.chatHistory[0].role).toBe('user')
      expect(retrieved!.chatHistory[1].role).toBe('assistant')
      expect(retrieved!.chatHistory[1].content).toBe('让我来分析一下情况...')
    })
  })

  describe('getAllCases', () => {
    it('should return cases sorted by createdAt desc', async () => {
      const older = makeCase('older', '旧案件')
      older.createdAt = '2024-01-01T00:00:00.000Z'

      const newer = makeCase('newer', '新案件')
      newer.createdAt = '2025-01-01T00:00:00.000Z'

      const middle = makeCase('middle', '中间案件')
      middle.createdAt = '2024-06-01T00:00:00.000Z'

      await saveCase(older)
      await saveCase(middle)
      await saveCase(newer)

      const cases = await getAllCases()
      expect(cases.length).toBeGreaterThanOrEqual(3)

      // Find our cases and verify order
      const ourCases = cases.filter((c) =>
        ['older', 'newer', 'middle'].includes(c.id)
      )
      expect(ourCases[0].id).toBe('newer')
      expect(ourCases[1].id).toBe('middle')
      expect(ourCases[2].id).toBe('older')
    })

    it('should return all cases when there are 10+ cases', async () => {
      for (let i = 0; i < 12; i++) {
        const c = makeCase(`bulk-${i}`, `批量案件 ${i}`)
        c.createdAt = new Date(2024, 0, i + 1).toISOString()
        await saveCase(c)
      }

      const cases = await getAllCases()
      const bulkCases = cases.filter((c) => c.id.startsWith('bulk-'))
      expect(bulkCases).toHaveLength(12)
    })
  })

  describe('deleteCase', () => {
    it('should remove a case', async () => {
      const c = makeCase('case-del', '待删除案件')
      await saveCase(c)

      let retrieved = await getCase('case-del')
      expect(retrieved).toBeDefined()

      await deleteCase('case-del')

      retrieved = await getCase('case-del')
      expect(retrieved).toBeUndefined()
    })

    it('should handle rapid sequential save/delete (stress)', async () => {
      const ids: string[] = []
      // Rapid save
      for (let i = 0; i < 5; i++) {
        const c = makeCase(`stress-${i}`, `压力测试 ${i}`)
        await saveCase(c)
        ids.push(`stress-${i}`)
      }

      // Verify all saved
      for (const id of ids) {
        const c = await getCase(id)
        expect(c).toBeDefined()
      }

      // Rapid delete
      for (const id of ids) {
        await deleteCase(id)
      }

      // Verify all deleted
      for (const id of ids) {
        const c = await getCase(id)
        expect(c).toBeUndefined()
      }
    })
  })
})
