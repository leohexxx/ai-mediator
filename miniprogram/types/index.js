// ═══════════════════════════════════════════════
// 啷个对 — 类型定义 (V3, JSDoc 版本)
// 来源: src/types/index.ts
// 小程序端使用 JSDoc 类型注释，无需 TypeScript 编译
// ═══════════════════════════════════════════════

/**
 * @typedef {Object} CoreConclusion
 * @property {'a'|'b'|'tie'} overallWinner - 最终胜方
 * @property {number} scoreA - 甲方分数 0-100
 * @property {number} scoreB - 乙方分数 0-100
 * @property {string} oneLineVerdict - 一句话结论
 * @property {string[]} keyReasons - 2-3 个核心原因
 * @property {string} recommendedAction - 建议行动
 * @property {number} confidence - 置信度 0-100
 * @property {string[]} confidenceReasons - 置信度原因
 */

/**
 * @typedef {Object} EvidenceWeight
 * @property {string} id
 * @property {string} speaker
 * @property {string} content
 * @property {string|null} timestamp
 * @property {number} weight - 0-100
 * @property {string} weightReason
 * @property {'a'|'b'|'neutral'} favors
 */

/**
 * @typedef {Object} EmotionPoint
 * @property {string|null} timestamp
 * @property {string} emotion
 * @property {number} intensity - 0-100
 * @property {string} trigger
 */

/**
 * @typedef {Object} EmotionCurve
 * @property {string} speaker
 * @property {EmotionPoint[]} points
 */

/**
 * @typedef {Object} MediationStep
 * @property {number} step
 * @property {string} title
 * @property {string} description
 * @property {'a'|'b'|'both'} target
 * @property {string} expectedOutcome
 * @property {'easy'|'medium'|'hard'} difficulty
 */

/**
 * @typedef {Object} Character
 * @property {string} name
 * @property {'party_a'|'party_b'|'other'} role
 * @property {string} personality
 * @property {string} stance
 * @property {string} emotionalState
 * @property {string} communicationStyle
 */

/**
 * @typedef {Object} Conflict
 * @property {string} topic
 * @property {string} partyAStance
 * @property {string} partyBStance
 * @property {string} aiJudgment
 * @property {'a'|'b'|'tie'} winner
 * @property {'low'|'medium'|'high'} severity
 */

/**
 * @typedef {Object} TimelineEvent
 * @property {string} timestamp
 * @property {string} speaker
 * @property {string} content
 * @property {string} emotion
 * @property {string} significance
 * @property {boolean} isTurningPoint
 */

/**
 * @typedef {Object} DetailedAnalysis
 * @property {string} summary
 * @property {string} relationship
 * @property {Character[]} characters
 * @property {Conflict[]} conflicts
 * @property {TimelineEvent[]} timeline
 */

/**
 * @typedef {Object} Advice
 * @property {string[]} toA
 * @property {string[]} toB
 * @property {string[]} toBoth
 */

/**
 * @typedef {Object} Analysis
 * @property {string} id
 * @property {string} caseId
 * @property {string} createdAt
 * @property {'v1'|'v2'|'v4'|'v5'} schemaVersion
 * @property {CoreConclusion} coreConclusion
 * @property {Object} reportSections
 * @property {Object} evidenceFeatures
 * @property {Object} evidenceQuality
 * @property {Object[]} extractedFacts
 * @property {Object[]} safetySignals
 * @property {Object[]} knowledgeReferences
 * @property {EvidenceWeight[]} evidenceWeights
 * @property {EmotionCurve[]} emotionCurve
 * @property {MediationStep[]} mediationStrategy
 * @property {DetailedAnalysis} detailedAnalysis
 * @property {Advice} advice
 */

/**
 * @typedef {Object} AnalysisProgress
 * @property {string} step - queued/formatting/extracting/quality_gate/retrieving/analyzing/validating/finalizing/done
 * @property {string} message
 * @property {number} progress - 0-100
 */

/** 空导出，仅供 JSDoc 类型引用 */
module.exports = {};
