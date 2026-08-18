// ═══════════════════════════════════════════════
// AI 调解员 — 服务端类型定义 (v2 重构)
// 与 src/types/index.ts 保持镜像一致
// ═══════════════════════════════════════════════

// ── 证据 ──────────────────────────────────────────
export interface Evidence {
  id: string
  type: 'screenshot' | 'screen_recording' | 'text'
  source: 'party_a' | 'party_b' | 'self'
  fileName: string
  extractedText: string
  uploadedAt: string
}

// ── V1 类型（用于旧数据迁移） ──────────────────────
export interface V1Character {
  name: string
  role: 'party_a' | 'party_b' | 'other'
  personality: string
  stance: string
  emotionalState: string
}

export interface V1TimelineEvent {
  timestamp: string
  speaker: string
  content: string
  emotion: string
  significance: string
}

export interface V1Conflict {
  topic: string
  partyAStance: string
  partyBStance: string
  aiJudgment: string
  winner: 'a' | 'b' | 'tie'
}

export interface Verdict {
  summary: string
  scoreA: number
  scoreB: number
  reasoning: string[]
  overallWinner: 'a' | 'b' | 'tie'
}

export interface V1Analysis {
  id: string
  caseId: string
  summary: string
  characters: V1Character[]
  relationship: string
  timeline: V1TimelineEvent[]
  conflicts: V1Conflict[]
  verdict: Verdict
  advice: Advice
  createdAt: string
}

// ── V2 核心结论 ───────────────────────────────────
export interface CoreConclusion {
  overallWinner: 'a' | 'b' | 'tie'
  scoreA: number
  scoreB: number
  oneLineVerdict: string
  keyReasons: string[]
  recommendedAction: string
  confidence: number
  confidenceReasons: string[]
}

// ── V2 证据权重 ───────────────────────────────────
export interface EvidenceWeight {
  id: string
  speaker: string
  content: string
  timestamp: string | null
  weight: number
  weightReason: string
  favors: 'a' | 'b' | 'neutral'
}

// ── V2 情绪曲线 ───────────────────────────────────
export interface EmotionPoint {
  timestamp: string | null
  emotion: string
  intensity: number
  trigger: string
}

export interface EmotionCurve {
  speaker: string
  points: EmotionPoint[]
}

// ── V2 调解策略 ───────────────────────────────────
export interface MediationStep {
  step: number
  title: string
  description: string
  target: 'a' | 'b' | 'both'
  expectedOutcome: string
  difficulty: 'easy' | 'medium' | 'hard'
}

// ── V2 详细分析 ───────────────────────────────────
export interface Character {
  name: string
  role: 'party_a' | 'party_b' | 'other'
  personality: string
  stance: string
  emotionalState: string
  communicationStyle: string
}

export interface Conflict {
  topic: string
  partyAStance: string
  partyBStance: string
  aiJudgment: string
  winner: 'a' | 'b' | 'tie'
  severity: 'low' | 'medium' | 'high'
}

export interface TimelineEvent {
  timestamp: string
  speaker: string
  content: string
  emotion: string
  significance: string
  isTurningPoint: boolean
}

export interface DetailedAnalysis {
  summary: string
  relationship: string
  characters: Character[]
  conflicts: Conflict[]
  timeline: TimelineEvent[]
}

// ── 建议 ──────────────────────────────────────────
export interface Advice {
  toA: string[]
  toB: string[]
  toBoth: string[]
}

// ── V2 完整 Analysis 结构 ─────────────────────────
export interface Analysis {
  id: string
  caseId: string
  createdAt: string
  schemaVersion: 'v1' | 'v2'

  coreConclusion: CoreConclusion
  evidenceWeights: EvidenceWeight[]
  emotionCurve: EmotionCurve[]
  mediationStrategy: MediationStep[]
  detailedAnalysis: DetailedAnalysis
  advice: Advice
}

// ── 聊天消息 ──────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// ── 案例 ──────────────────────────────────────────
export interface Case {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  parties: { name: string; role: string }[]
  evidence: Evidence[]
  rawText: string
  analysis: Analysis | null
  chatHistory: ChatMessage[]
  relationship?: string
}
