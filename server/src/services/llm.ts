import type { Analysis, ChatMessage } from '../types.js'

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

// ── Prompt (same for all providers) ──────────────────────────────

const ANALYSIS_PROMPT = `你是一位经验丰富的情感调解专家和仲裁员。你的任务是基于提供的聊天记录，进行客观、深入的分析。

请严格按照以下 JSON 格式返回分析结果（不要包含任何其他文字）：

{
  "summary": "一句话概括本次冲突的核心",
  "relationship": "判断的人物关系（如：情侣、朋友、同事、家人等）",
  "characters": [
    {
      "name": "人物名称",
      "role": "party_a 或 party_b 或 other",
      "personality": "性格特点分析",
      "stance": "其核心立场和诉求",
      "emotionalState": "当前情绪状态"
    }
  ],
  "timeline": [
    {
      "timestamp": "时间",
      "speaker": "说话人",
      "content": "关键对话内容摘要",
      "emotion": "情绪标签（如生气/委屈/冷静/伤心等）",
      "significance": "为什么这条消息重要"
    }
  ],
  "conflicts": [
    {
      "topic": "争议话题",
      "partyAStance": "甲方立场",
      "partyBStance": "乙方立场",
      "aiJudgment": "AI 的客观判断",
      "winner": "更有理的一方：a 或 b 或 tie"
    }
  ],
  "verdict": {
    "summary": "综合判断总结",
    "scoreA": 60,
    "scoreB": 40,
    "reasoning": ["理由1", "理由2", "理由3"],
    "overallWinner": "a 或 b 或 tie"
  },
  "advice": {
    "toA": ["给甲方的具体建议1", "建议2"],
    "toB": ["给乙方的具体建议1", "建议2"],
    "toBoth": ["双方应该共同注意的事项"]
  }
}

评分规则：
- scoreA + scoreB = 100
- 分数高的一方代表更有理
- 请基于客观事实判断，不要被情绪化语言左右
- 考虑到聊天记录可能不完整，请在判断时留有余地

请用中文输出所有内容。`

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

  const partyInfo = parties
    .map((p) => `- ${p.role === 'party_a' ? '甲方' : '乙方'}: ${p.name}`)
    .join('\n')

  const userPrompt = `${ANALYSIS_PROMPT}

---
## 案件背景
${caseContext || '无额外背景信息'}

## 当事人信息
${partyInfo}

## 聊天记录
${formattedChat}
---
请分析以上聊天记录，输出 JSON 格式的分析结果。`

  onProgress?.('正在理解对话上下文...', 20)

  const response = await fetch(buildChatEndpoint(config), {
    method: 'POST',
    headers: buildHeaders(config),
    body: buildRequestBody(config, [{ role: 'user', content: userPrompt }], 4096, false),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM API error: ${response.status} ${err}`)
  }

  onProgress?.('正在分析人物关系...', 40)
  onProgress?.('正在定位冲突节点...', 60)

  const data = await response.json()
  const text = extractTextFromResponse(config, data as Record<string, unknown>)

  onProgress?.('正在生成分析报告...', 80)

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from LLM response')
  }

  onProgress?.('分析完成！', 100)

  return JSON.parse(jsonMatch[0]) as Analysis
}

export async function chatWithAnalysis(
  context: string,
  history: ChatMessage[],
  newMessage: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const config = getConfig()

  const messages = [
    {
      role: 'system' as const,
      content: `你是一位情感调解专家。基于之前的案例分析，回答用户的追问。请保持客观、中肯。请用中文回答。

## 之前的分析报告
${context}`,
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
