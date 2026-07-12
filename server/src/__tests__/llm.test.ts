import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock global fetch before it can be captured by any module-under-test closure
// ---------------------------------------------------------------------------
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Save original env so we can restore between tests
const originalApiKey = process.env.ANTHROPIC_API_KEY
const originalProvider = process.env.LLM_PROVIDER
const originalLlmApiKey = process.env.LLM_API_KEY

// ESM static imports – safe because the service module only reads `fetch` /
// `process.env` at call-time, never at module-evaluation time.
import { analyzeChat, chatWithAnalysis } from '../services/llm.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockResponseOpts {
  ok?: boolean
  status?: number
  json?: unknown
  text?: string
  body?: ReadableStream | null
}

function makeMockResponse(opts: MockResponseOpts = {}) {
  const { ok = true, status = 200, json: jsonData, text = '', body = null } = opts
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(jsonData),
    text: vi.fn().mockResolvedValue(text),
    body,
  }
}

function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

/** A valid v2 Analysis object matching the shape expected by the AI Mediator types */
const validAnalysisJson = {
  coreConclusion: {
    overallWinner: 'b',
    scoreA: 45,
    scoreB: 55,
    oneLineVerdict: '沟通期待不一致导致的争吵',
    keyReasons: ['小红应有更明确的回应', '小明应降低期待，给对方空间'],
    recommendedAction: '约定一个双方都舒适的沟通节奏',
    confidence: 70,
    confidenceReasons: ['聊天记录较为完整'],
  },
  evidenceWeights: [],
  emotionCurve: [],
  mediationStrategy: [],
  detailedAnalysis: {
    summary: '测试摘要——沟通不足导致的误会',
    relationship: '情侣',
    characters: [
      {
        name: '小明',
        role: 'party_a',
        personality: '直率但容易焦虑',
        stance: '希望对方及时回应',
        emotionalState: '生气',
        communicationStyle: '追问型',
      },
      {
        name: '小红',
        role: 'party_b',
        personality: '温柔但回避冲突',
        stance: '希望有自己的空间',
        emotionalState: '委屈',
        communicationStyle: '回避型',
      },
    ],
    timeline: [
      {
        timestamp: '2024-07-01 10:00',
        speaker: '小明',
        content: '你为什么不回我消息',
        emotion: '生气',
        significance: '冲突导火索',
        isTurningPoint: false,
      },
    ],
    conflicts: [
      {
        topic: '消息回复频率',
        partyAStance: '小明认为应该及时回复',
        partyBStance: '小红认为不需要时刻在线',
        aiJudgment: '双方需要在沟通频率上达成共识，而非互相指责',
        winner: 'tie',
        severity: 'medium',
      },
    ],
  },
  advice: {
    toA: ['减少频繁追问，给予对方信任'],
    toB: ['即使忙碌也尽量简短回复，表明自己看到了消息'],
    toBoth: ['约定一个双方都舒适的沟通节奏'],
  },
}

const testChat = '小明: 你怎么了\n小红: 没怎么'
const testParties = [
  { name: '小明', role: 'party_a' as const },
  { name: '小红', role: 'party_b' as const },
]
const testContext = '这是一个测试案件背景'

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.LLM_PROVIDER = 'anthropic'
  process.env.LLM_API_KEY = 'test-key'
  delete process.env.ANTHROPIC_API_KEY
  mockFetch.mockReset()
})

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalApiKey
  }
  if (originalProvider === undefined) {
    delete process.env.LLM_PROVIDER
  } else {
    process.env.LLM_PROVIDER = originalProvider
  }
  if (originalLlmApiKey === undefined) {
    delete process.env.LLM_API_KEY
  } else {
    process.env.LLM_API_KEY = originalLlmApiKey
  }
})

// ===========================================================================
//  analyzeChat
// ===========================================================================

describe('analyzeChat', () => {
  // -----------------------------------------------------------------------
  // Progress callbacks
  // -----------------------------------------------------------------------
  describe('Progress callbacks', () => {
    it('calls onProgress with the correct step names and progress values in ascending order', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: JSON.stringify(validAnalysisJson) }] },
        }),
      )

      const calls: Array<{ step: string; progress: number }> = []
      const onProgress = (step: string, progress: number) =>
        calls.push({ step, progress })

      await analyzeChat(testChat, testParties, testContext, onProgress)

      // CoT 5 steps + done = 6 calls
      expect(calls).toHaveLength(6)

      expect(calls[0]).toEqual({ step: 'understanding', progress: 20 })
      expect(calls[1]).toEqual({ step: 'evidence', progress: 40 })
      expect(calls[2]).toEqual({ step: 'emotion', progress: 55 })
      expect(calls[3]).toEqual({ step: 'judging', progress: 75 })
      expect(calls[4]).toEqual({ step: 'strategy', progress: 90 })
      expect(calls[5]).toEqual({ step: 'done', progress: 100 })

      // Verify progress values are strictly increasing
      const progressValues = calls.map((c) => c.progress)
      expect(progressValues).toEqual([20, 40, 55, 75, 90, 100])
    })

    it('does not call onProgress when no callback is provided', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: JSON.stringify(validAnalysisJson) }] },
        }),
      )

      // Should not throw even though onProgress is undefined
      await expect(
        analyzeChat(testChat, testParties, testContext),
      ).resolves.toBeDefined()
    })
  })

  // -----------------------------------------------------------------------
  // Response parsing
  // -----------------------------------------------------------------------
  describe('Response parsing', () => {
    it('parses a plain JSON string and returns a correct v2 Analysis structure', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: JSON.stringify(validAnalysisJson) }] },
        }),
      )

      const result = await analyzeChat(testChat, testParties, testContext)

      expect(result.detailedAnalysis.summary).toBe('测试摘要——沟通不足导致的误会')
      expect(result.detailedAnalysis.relationship).toBe('情侣')
      expect(result.detailedAnalysis.characters).toHaveLength(2)
      expect(result.detailedAnalysis.characters[0].name).toBe('小明')
      expect(result.detailedAnalysis.characters[0].role).toBe('party_a')
      expect(result.detailedAnalysis.timeline).toHaveLength(1)
      expect(result.detailedAnalysis.conflicts).toHaveLength(1)
      expect(result.detailedAnalysis.conflicts[0].winner).toBe('tie')
      expect(result.coreConclusion).toBeDefined()
      expect(result.coreConclusion.scoreA + result.coreConclusion.scoreB).toBe(100)
      expect(result.advice).toBeDefined()
      expect(result.advice.toA).toHaveLength(1)
      expect(result.advice.toB).toHaveLength(1)
      expect(result.advice.toBoth).toHaveLength(1)
    })

    it('parses JSON wrapped inside a markdown code block', async () => {
      const markdownWrapped = '```json\n' + JSON.stringify(validAnalysisJson) + '\n```'

      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: markdownWrapped }] },
        }),
      )

      const result = await analyzeChat(testChat, testParties, testContext)

      expect(result.detailedAnalysis.summary).toBe('测试摘要——沟通不足导致的误会')
      expect(result.detailedAnalysis.relationship).toBe('情侣')
      expect(result.coreConclusion.scoreA).toBe(45)
    })

    it('parses JSON with extra text before and after the object', async () => {
      const noisyText =
        '这是我的一些思考...\n\n' +
        JSON.stringify(validAnalysisJson) +
        '\n\n以上就是我对这次冲突的分析，希望对你们有帮助。'

      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: noisyText }] },
        }),
      )

      const result = await analyzeChat(testChat, testParties, testContext)
      expect(result.detailedAnalysis.summary).toBe('测试摘要——沟通不足导致的误会')
    })
  })

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('Error handling', () => {
    it('throws when API key is empty', async () => {
      delete process.env.LLM_API_KEY
      process.env.ANTHROPIC_API_KEY = ''

      await expect(
        analyzeChat(testChat, testParties, testContext),
      ).rejects.toThrow('Missing API key')
    })

    it('throws on HTTP 401 with status code in the error message', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({ ok: false, status: 401, text: 'Unauthorized' }),
      )

      await expect(
        analyzeChat(testChat, testParties, testContext),
      ).rejects.toThrow('LLM API error: 401')
    })

    it('throws on HTTP 500 with status code in the error message', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          ok: false,
          status: 500,
          text: 'Internal Server Error',
        }),
      )

      await expect(
        analyzeChat(testChat, testParties, testContext),
      ).rejects.toThrow('LLM API error: 500')
    })

    it('throws when the response contains no JSON object (no curly braces)', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: {
            content: [{ text: '这是一段纯文本，没有任何 JSON 结构' }],
          },
        }),
      )

      await expect(
        analyzeChat(testChat, testParties, testContext),
      ).rejects.toThrow('Failed to parse JSON')
    })

    it('throws when the response text is empty', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: '' }] },
        }),
      )

      await expect(
        analyzeChat(testChat, testParties, testContext),
      ).rejects.toThrow('Failed to parse JSON')
    })

    it('throws when the content array is empty', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [] },
        }),
      )

      await expect(
        analyzeChat(testChat, testParties, testContext),
      ).rejects.toThrow('Failed to parse JSON')
    })

    it('throws on network failure (fetch itself rejects)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await expect(
        analyzeChat(testChat, testParties, testContext),
      ).rejects.toThrow('Network error')
    })
  })

  // -----------------------------------------------------------------------
  // Prompt construction
  // -----------------------------------------------------------------------
  describe('Prompt construction', () => {
    it('includes party info with 甲方/乙方 labels in the prompt', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: JSON.stringify(validAnalysisJson) }] },
        }),
      )

      await analyzeChat(testChat, testParties, testContext)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const prompt: string = body.messages[0].content

      expect(prompt).toContain('甲方')
      expect(prompt).toContain('乙方')
      expect(prompt).toContain('小明')
      expect(prompt).toContain('小红')
    })

    it('includes case context in the prompt', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: JSON.stringify(validAnalysisJson) }] },
        }),
      )

      await analyzeChat(testChat, testParties, '这是我的案件背景')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const prompt: string = body.messages[0].content

      expect(prompt).toContain('这是我的案件背景')
    })

    it('includes the chat content in the prompt', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: JSON.stringify(validAnalysisJson) }] },
        }),
      )

      const chatContent = '小明: 你好\n小红: 你好啊'
      await analyzeChat(chatContent, testParties, testContext)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const prompt: string = body.messages[0].content

      expect(prompt).toContain('小明: 你好')
      expect(prompt).toContain('小红: 你好啊')
    })

    it('includes all required section headers in the prompt', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: JSON.stringify(validAnalysisJson) }] },
        }),
      )

      await analyzeChat(testChat, testParties, testContext)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const prompt: string = body.messages[0].content

      expect(prompt).toContain('## 案件背景')
      expect(prompt).toContain('## 当事人信息')
      expect(prompt).toContain('## 聊天记录')
    })

    it('handles empty case context gracefully', async () => {
      mockFetch.mockResolvedValue(
        makeMockResponse({
          json: { content: [{ text: JSON.stringify(validAnalysisJson) }] },
        }),
      )

      await analyzeChat(testChat, testParties, '')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const prompt: string = body.messages[0].content

      expect(prompt).toContain('无额外背景信息')
    })
  })
})

// ===========================================================================
//  chatWithAnalysis
// ===========================================================================

describe('chatWithAnalysis', () => {
  // -----------------------------------------------------------------------
  // Streaming
  // -----------------------------------------------------------------------
  describe('Streaming', () => {
    it('calls onChunk for each text delta in the SSE stream', async () => {
      const stream = createSSEStream([
        'data: {"type":"content_block_delta","delta":{"text":"你好"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"，我是调解专家"}}\n\n',
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      const received: string[] = []
      await chatWithAnalysis('ctx', [], 'hello', (chunk) => received.push(chunk))

      expect(received).toHaveLength(2)
      expect(received[0]).toBe('你好')
      expect(received[1]).toBe('，我是调解专家')
    })

    it('accumulates the full stream text into the return value', async () => {
      const stream = createSSEStream([
        'data: {"type":"content_block_delta","delta":{"text":"第一部分"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"第二部分"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"第三部分"}}\n\n',
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      const full = await chatWithAnalysis('ctx', [], 'test', () => {})

      expect(full).toBe('第一部分第二部分第三部分')
    })

    it('handles empty delta (missing text property) – callback is NOT called for empty text', async () => {
      const stream = createSSEStream([
        'data: {"type":"content_block_delta","delta":{}}\n\n',
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      const received: string[] = []
      const full = await chatWithAnalysis('ctx', [], 'test', (chunk) =>
        received.push(chunk),
      )

      expect(received).toHaveLength(0)
      expect(full).toBe('')
    })

    it('skips non-content_block_delta events (message_start, message_stop, etc.)', async () => {
      const stream = createSSEStream([
        'data: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
        'data: {"type":"content_block_start","content_block":{"type":"text"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"有效文本"}}\n\n',
        'data: {"type":"content_block_stop"}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      const received: string[] = []
      const full = await chatWithAnalysis('ctx', [], 'test', (chunk) =>
        received.push(chunk),
      )

      expect(received).toHaveLength(1)
      expect(received[0]).toBe('有效文本')
      expect(full).toBe('有效文本')
    })

    it('ignores malformed JSON lines in the SSE stream without crashing', async () => {
      const stream = createSSEStream([
        'data: {malformed json!!!}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"正常文本"}}\n\n',
        'data: [DONE]\n\n',
      ])

      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      const received: string[] = []
      const full = await chatWithAnalysis('ctx', [], 'test', (chunk) =>
        received.push(chunk),
      )

      expect(received).toHaveLength(1)
      expect(received[0]).toBe('正常文本')
      expect(full).toBe('正常文本')
    })

    it('handles an empty stream (only [DONE])', async () => {
      const stream = createSSEStream(['data: [DONE]\n\n'])

      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      const received: string[] = []
      const full = await chatWithAnalysis('ctx', [], 'test', (chunk) =>
        received.push(chunk),
      )

      expect(received).toHaveLength(0)
      expect(full).toBe('')
    })
  })

  // -----------------------------------------------------------------------
  // History & context
  // -----------------------------------------------------------------------
  describe('History and context', () => {
    it('passes chat history messages to the API request body', async () => {
      const history = [
        {
          id: '1',
          role: 'user' as const,
          content: '之前用户的问题',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          role: 'assistant' as const,
          content: '之前助手的回答',
          timestamp: '2024-01-01T00:00:01Z',
        },
      ]

      const stream = createSSEStream(['data: [DONE]\n\n'])
      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      await chatWithAnalysis('analysis context', history, '新消息', () => {})

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const messages: Array<{ role: string; content: string }> = body.messages

      const userMsg = messages.find(
        (m) => m.role === 'user' && m.content === '之前用户的问题',
      )
      const assistantMsg = messages.find(
        (m) => m.role === 'assistant' && m.content === '之前助手的回答',
      )

      expect(userMsg).toBeDefined()
      expect(assistantMsg).toBeDefined()
    })

    it('includes the analysis context in the system prompt', async () => {
      const stream = createSSEStream(['data: [DONE]\n\n'])
      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      await chatWithAnalysis('这是一份详细的分析报告内容', [], 'test', () => {})

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      // Anthropic provider: system message is in body.system
      const systemContent = body.system || body.messages?.find((m: { role: string }) => m.role === 'system')?.content
      expect(systemContent).toBeDefined()
      expect(systemContent).toContain('这是一份详细的分析报告内容')
      expect(systemContent).toContain('## 之前的分析报告')
    })

    it('places the new message as the final user message in the messages array', async () => {
      const stream = createSSEStream(['data: [DONE]\n\n'])
      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      await chatWithAnalysis('ctx', [], '这是最新的用户消息', () => {})

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const messages: Array<{ role: string; content: string }> = body.messages

      const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user')
      expect(lastUserIdx).toBeGreaterThanOrEqual(0)
      expect(messages[lastUserIdx].content).toBe('这是最新的用户消息')
    })

    it('preserves message order: system -> history -> new message', async () => {
      const history = [
        {
          id: '1',
          role: 'user' as const,
          content: 'Q1',
          timestamp: '',
        },
        {
          id: '2',
          role: 'assistant' as const,
          content: 'A1',
          timestamp: '',
        },
      ]

      const stream = createSSEStream(['data: [DONE]\n\n'])
      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      await chatWithAnalysis('ctx', history, 'Q2', () => {})

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      // Anthropic provider: system message is in body.system, chat messages in body.messages
      expect(body.system).toBeDefined()
      const messages: Array<{ role: string; content: string }> = body.messages

      expect(messages).toHaveLength(3) // Q1, A1, Q2 (system is separate)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Q1')
      expect(messages[1].role).toBe('assistant')
      expect(messages[1].content).toBe('A1')
      expect(messages[2].role).toBe('user')
      expect(messages[2].content).toBe('Q2')
    })

    it('sets stream: true in the API request', async () => {
      const stream = createSSEStream(['data: [DONE]\n\n'])
      mockFetch.mockResolvedValue(makeMockResponse({ body: stream }))

      await chatWithAnalysis('ctx', [], 'test', () => {})

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.stream).toBe(true)
      expect(body.max_tokens).toBe(2048)
    })
  })
})
