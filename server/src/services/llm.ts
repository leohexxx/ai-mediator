import type { Analysis, ChatMessage } from '../types.js'

interface LLMConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

function getConfig(): LLMConfig {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
    baseUrl: process.env.LLM_BASE_URL,
  }
}

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

export async function analyzeChat(
  formattedChat: string,
  parties: { name: string; role: string }[],
  caseContext: string,
  onProgress?: (step: string, progress: number) => void
): Promise<Analysis> {
  const config = getConfig()
  if (!config.apiKey) {
    throw new Error('Missing API key. Set ANTHROPIC_API_KEY environment variable.')
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

  const response = await fetch(
    config.baseUrl || 'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM API error: ${response.status} ${err}`)
  }

  onProgress?.('正在分析人物关系...', 40)
  onProgress?.('正在定位冲突节点...', 60)

  const data = await response.json()
  const rawText = data.content?.[0]?.text
  const text = typeof rawText === 'string' ? rawText : (rawText != null ? String(rawText) : '')

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
  onChunk: (chunk: string) => void
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

  const response = await fetch(
    config.baseUrl || 'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2048,
        messages,
        stream: true,
      }),
    }
  )

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
        if (parsed.type === 'content_block_delta') {
          const text = parsed.delta?.text || ''
          fullText += text
          onChunk(text)
        }
      } catch {
        // skip
      }
    }
  }

  return fullText
}
