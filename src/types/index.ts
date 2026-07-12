// ═══════════════════════════════════════════════
// AI 调解员 — 类型定义 (v2 重构)
// ═══════════════════════════════════════════════

// ── 证据 ──────────────────────────────────────────
export interface Evidence {
  id: string;
  type: 'screenshot' | 'screen_recording' | 'text';
  source: 'party_a' | 'party_b' | 'self';
  fileName: string;
  extractedText: string;
  uploadedAt: string;
}

// ── V1 类型（用于旧数据迁移） ──────────────────────
/** V1 Character（无 communicationStyle） */
export interface V1Character {
  name: string;
  role: 'party_a' | 'party_b' | 'other';
  personality: string;
  stance: string;
  emotionalState: string;
}

/** V1 TimelineEvent（无 isTurningPoint） */
export interface V1TimelineEvent {
  timestamp: string;
  speaker: string;
  content: string;
  emotion: string;
  significance: string;
}

/** V1 Conflict（无 severity） */
export interface V1Conflict {
  topic: string;
  partyAStance: string;
  partyBStance: string;
  aiJudgment: string;
  winner: 'a' | 'b' | 'tie';
}

/** V1 Verdict（旧版仲裁结果） */
export interface Verdict {
  summary: string;
  scoreA: number;
  scoreB: number;
  reasoning: string[];
  overallWinner: 'a' | 'b' | 'tie';
}

/** V1 Analysis（旧版完整分析结构） */
export interface V1Analysis {
  id: string;
  caseId: string;
  summary: string;
  characters: V1Character[];
  relationship: string;
  timeline: V1TimelineEvent[];
  conflicts: V1Conflict[];
  verdict: Verdict;
  advice: Advice;
  createdAt: string;
}

// ── V2 核心结论（第一屏） ─────────────────────────
export interface CoreConclusion {
  overallWinner: 'a' | 'b' | 'tie';
  scoreA: number;                  // 0-100, scoreA + scoreB = 100
  scoreB: number;
  oneLineVerdict: string;          // 一句话结论
  keyReasons: string[];            // 2-3 个核心原因
  recommendedAction: string;       // 建议的下一步行动
  confidence: number;              // 0-100, AI 判断置信度
  confidenceReasons: string[];     // 置信度高/低的原因
}

// ── V2 证据权重（第二屏） ─────────────────────────
export interface EvidenceWeight {
  id: string;                      // "ev_w_1"
  speaker: string;                 // 说话人名字
  content: string;                 // 关键对话原文
  timestamp: string | null;        // 时间（如果有）
  weight: number;                  // 0-100, 证据权重
  weightReason: string;            // 为什么这条证据重要
  favors: 'a' | 'b' | 'neutral';  // 偏向哪一方
}

// ── V2 情绪曲线（第二屏） ─────────────────────────
export interface EmotionPoint {
  timestamp: string | null;        // 时间
  emotion: string;                 // 情绪标签
  intensity: number;               // 0-100, 情绪强度
  trigger: string;                 // 触发该情绪的原因
}

export interface EmotionCurve {
  speaker: string;                 // 说话人名字
  points: EmotionPoint[];          // 情绪变化数据点序列
}

// ── V2 调解策略（第三屏） ─────────────────────────
export interface MediationStep {
  step: number;                    // 步骤序号 1, 2, 3...
  title: string;                   // 步骤标题
  description: string;             // 具体做什么
  target: 'a' | 'b' | 'both';     // 针对哪一方
  expectedOutcome: string;         // 预期效果
  difficulty: 'easy' | 'medium' | 'hard';  // 执行难度
}

// ── V2 详细分析（第四屏，折叠） ────────────────────

/** V2 Character（新增 communicationStyle） */
export interface Character {
  name: string;
  role: 'party_a' | 'party_b' | 'other';
  personality: string;
  stance: string;
  emotionalState: string;
  communicationStyle: string;      // 沟通风格（新增）
}

/** V2 Conflict（新增 severity） */
export interface Conflict {
  topic: string;
  partyAStance: string;
  partyBStance: string;
  aiJudgment: string;
  winner: 'a' | 'b' | 'tie';
  severity: 'low' | 'medium' | 'high';  // 严重程度（新增）
}

/** V2 TimelineEvent（新增 isTurningPoint） */
export interface TimelineEvent {
  timestamp: string;
  speaker: string;
  content: string;
  emotion: string;
  significance: string;
  isTurningPoint: boolean;         // 是否为转折点（新增）
}

export interface DetailedAnalysis {
  summary: string;                 // 案情摘要
  relationship: string;            // 人物关系
  characters: Character[];
  conflicts: Conflict[];
  timeline: TimelineEvent[];
}

// ── 建议（追问上下文用） ──────────────────────────
export interface Advice {
  toA: string[];
  toB: string[];
  toBoth: string[];
}

// ── V2 完整 Analysis 结构 ─────────────────────────
export interface Analysis {
  id: string;
  caseId: string;
  createdAt: string;
  schemaVersion: 'v1' | 'v2';

  // 第一层：核心结论（第一屏前置）
  coreConclusion: CoreConclusion;

  // 第二层：证据 & 情绪
  evidenceWeights: EvidenceWeight[];    // 3-8 条
  emotionCurve: EmotionCurve[];         // 每方一个

  // 第三层：调解策略
  mediationStrategy: MediationStep[];   // 3-5 步

  // 第四层：详细分析（折叠）
  detailedAnalysis: DetailedAnalysis;

  // 追问/建议
  advice: Advice;
}

// ── 聊天消息 ──────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ── 案例 ──────────────────────────────────────────
export interface Case {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  parties: { name: string; role: string }[];
  evidence: Evidence[];
  rawText: string;
  analysis: Analysis | null;
  chatHistory: ChatMessage[];
  relationship?: string;
}

// ── 分析进度 ──────────────────────────────────────
export type AnalysisStep =
  | 'extracting'
  | 'parsing'
  | 'understanding'
  | 'evidence'
  | 'emotion'
  | 'judging'
  | 'strategy'
  | 'done'
  | 'error';

export interface AnalysisProgress {
  step: AnalysisStep;
  message: string;
  progress: number; // 0-100
}
