import type { Analysis, ChatMessage } from '../types.js'
import { buildAnalysisUserPrompt } from '../prompts/analysisPrompt.js'
import { buildChatSystemPrompt } from '../prompts/chatPrompt.js'

type LLMProvider = 'anthropic' | 'deepseek' | 'openai'

interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model: string
  baseUrl: string
}

function getConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER || 'anthropic') as LLMProvider

  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''

  const defaultBaseUrl =
    provider === 'anthropic'
      ? 'https://api.anthropic.com/v1'
      : provider === 'deepseek'
        ? 'https://api.deepseek.com/v1'
        : 'https://api.openai.com/v1'

  const defaultModel =
    provider === 'anthropic'
      ? 'claude-sonnet-4-20250514'
      : provider === 'deepseek'
        ? 'deepseek-chat'
        : 'gpt-4o'

  return {
    provider,
    apiKey,
    model: process.env.LLM_MODEL || defaultModel,
    baseUrl: process.env.LLM_BASE_URL || defaultBaseUrl,
  }
}

// ── API call helpers ─────────────────────────────────────────────

function buildHeaders(config: LLMConfig): Record<string, string> {
  if (config.provider === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    }
  }
  // OpenAI-compatible (DeepSeek, OpenAI, etc.)
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
}

function buildChatEndpoint(config: LLMConfig): string {
  if (config.provider === 'anthropic') {
    return `${config.baseUrl}/messages`
  }
  return `${config.baseUrl}/chat/completions`
}

function buildRequestBody(
  config: LLMConfig,
  messages: { role: string; content: string }[],
  maxTokens: number,
  stream: boolean,
): string {
  if (config.provider === 'anthropic') {
    // Extract system message if present
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: maxTokens,
      messages: chatMessages,
    }
    if (systemMsg) {
      body.system = systemMsg.content
    }
    if (stream) {
      body.stream = true
    }
    return JSON.stringify(body)
  }

  // OpenAI-compatible format
  return JSON.stringify({
    model: config.model,
    max_tokens: maxTokens,
    messages,
    stream,
  })
}

function extractTextFromResponse(config: LLMConfig, data: Record<string, unknown>): string {
  if (config.provider === 'anthropic') {
    const content = (data as { content?: Array<{ text?: string }> }).content
    const rawText = content?.[0]?.text
    return typeof rawText === 'string' ? rawText : rawText != null ? String(rawText) : ''
  }
  // OpenAI-compatible
  const choices = (data as { choices?: Array<{ message?: { content?: string } }> }).choices
  const rawText = choices?.[0]?.message?.content
  return typeof rawText === 'string' ? rawText : rawText != null ? String(rawText) : ''
}

function extractStreamDelta(config: LLMConfig, parsed: Record<string, unknown>): string {
  if (config.provider === 'anthropic') {
    if ((parsed as { type?: string }).type === 'content_block_delta') {
      return (parsed as { delta?: { text?: string } }).delta?.text || ''
    }
    return ''
  }
  // OpenAI-compatible
  return (parsed as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content || ''
}

// ── CoT progress step definitions ────────────────────────────────

interface CoTStep {
  step: string
  message: string
  progress: number
}

const COT_STEPS: CoTStep[] = [
  { step: 'understanding', message: '正在理解对话上下文...', progress: 20 },
  { step: 'evidence', message: '正在提取关键证据...', progress: 40 },
  { step: 'emotion', message: '正在分析情绪变化...', progress: 55 },
  { step: 'judging', message: '正在综合判断...', progress: 75 },
  { step: 'strategy', message: '正在制定调解策略...', progress: 90 },
  { step: 'done', message: '分析完成', progress: 100 },
]

// ── Public API ───────────────────────────────────────────────────

export async function analyzeChat(
  formattedChat: string,
  parties: { name: string; role: string }[],
  caseContext: string,
  onProgress?: (step: string, progress: number) => void,
): Promise<Analysis> {
  const config = getConfig()
  if (!config.apiKey) {
    throw new Error('Missing API key. Set LLM_API_KEY (or ANTHROPIC_API_KEY) environment variable.')
  }

  const userPrompt = buildAnalysisUserPrompt(formattedChat, parties, caseContext)

  // CoT Step 1: Understanding
  onProgress?.(COT_STEPS[0].step, COT_STEPS[0].progress)

  const response = await fetch(buildChatEndpoint(config), {
    method: 'POST',
    headers: buildHeaders(config),
    body: buildRequestBody(config, [{ role: 'user', content: userPrompt }], 8192, false),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM API error: ${response.status} ${err}`)
  }

  // CoT Steps 2-3: Evidence & Emotion (simulated while waiting for response body)
  onProgress?.(COT_STEPS[1].step, COT_STEPS[1].progress)
  onProgress?.(COT_STEPS[2].step, COT_STEPS[2].progress)

  const data = await response.json()
  const text = extractTextFromResponse(config, data as Record<string, unknown>)

  // CoT Step 4: Judging
  onProgress?.(COT_STEPS[3].step, COT_STEPS[3].progress)

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from LLM response')
  }

  // CoT Step 5: Strategy
  onProgress?.(COT_STEPS[4].step, COT_STEPS[4].progress)

  const parsed = JSON.parse(jsonMatch[0]) as Analysis

  // CoT Step 6: Done
  onProgress?.(COT_STEPS[5].step, COT_STEPS[5].progress)

  return parsed
}

export async function chatWithAnalysis(
  context: string,
  history: ChatMessage[],
  newMessage: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const config = getConfig()

  const systemPrompt = buildChatSystemPrompt(context)

  const messages = [
    {
      role: 'system' as const,
      content: systemPrompt,
    },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: newMessage },
  ]

  const response = await fetch(buildChatEndpoint(config), {
    method: 'POST',
    headers: buildHeaders(config),
    body: buildRequestBody(config, messages, 2048, true),
  })

  if (!response.ok) {
    throw new Error(`LLM chat error: ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))

    for (const line of lines) {
      const data = line.slice(6)
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        const text = extractStreamDelta(config, parsed)
        if (text) {
          fullText += text
          onChunk(text)
        }
      } catch {
        // skip unparseable chunks
      }
    }
  }

  return fullText
}
