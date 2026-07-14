// ═══════════════════════════════════════════════
// AI 调解员 — 类型定义 (v2 重构, CommonJS 版本)
// 来源: src/types/index.ts
// ═══════════════════════════════════════════════

/**
 * @typedef {Object} ParsedMessage
 * @property {string} speaker
 * @property {string} content
 * @property {string|null} timestamp
 * @property {'text'|'voice'|'sticker'|'image'|'system'} type
 */

/**
 * @typedef {Object} CoreConclusion
 * @property {'a'|'b'|'tie'} overallWinner
 * @property {number} scoreA - 0-100, scoreA + scoreB = 100
 * @property {number} scoreB
 * @property {string} oneLineVerdict
 * @property {string[]} keyReasons
 * @property {string} recommendedAction
 * @property {number} confidence - 0-100
 * @property {string[]} confidenceReasons
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
 * @property {'v1'|'v2'} schemaVersion
 * @property {CoreConclusion} coreConclusion
 * @property {EvidenceWeight[]} evidenceWeights
 * @property {EmotionCurve[]} emotionCurve
 * @property {MediationStep[]} mediationStrategy
 * @property {DetailedAnalysis} detailedAnalysis
 * @property {Advice} advice
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {string} timestamp
 */

/**
 * @typedef {Object} CaseData
 * @property {string} _id
 * @property {string} title
 * @property {string} relationship
 * @property {'both'|'initiator_only'} privacy
 * @property {{openid: string, nickname: string, avatarUrl: string, submitted: boolean, submittedAt: string|null}} party_a
 * @property {{openid: string|null, nickname: string, avatarUrl: string, submitted: boolean, submittedAt: string|null}} party_b
 * @property {'waiting_party_b'|'waiting_submission'|'analyzing'|'completed'|'expired'} status
 * @property {string|null} analysisId
 * @property {string|null} expiresAt
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} EvidenceRecord
 * @property {string} _id
 * @property {string} caseId
 * @property {'party_a'|'party_b'} party
 * @property {string} openid
 * @property {string} rawText
 * @property {ParsedMessage[]} parsedMessages
 * @property {string[]} fileIds
 * @property {string} note
 * @property {string} createdAt
 */

/**
 * @typedef {Object} AnalysisRecord
 * @property {string} _id
 * @property {string} caseId
 * @property {'v2'} schemaVersion
 * @property {CoreConclusion} coreConclusion
 * @property {EvidenceWeight[]} evidenceWeights
 * @property {EmotionCurve[]} emotionCurve
 * @property {MediationStep[]} mediationStrategy
 * @property {DetailedAnalysis} detailedAnalysis
 * @property {Advice} advice
 * @property {{step: string, message: string, progress: number}} progress
 * @property {string} createdAt
 */

/**
 * @typedef {Object} InvitationRecord
 * @property {string} _id
 * @property {string} caseId
 * @property {string} inviteCode
 * @property {boolean} used
 * @property {string|null} usedBy
 * @property {string} createdAt
 */

/**
 * @typedef {Object} MessageRecord
 * @property {string} _id
 * @property {string} caseId
 * @property {string} userId
 * @property {{text: string, order: number}[]} chunks
 * @property {'streaming'|'done'} status
 * @property {string} fullText
 * @property {string} createdAt
 * @property {string} updatedAt
 */

// 空导出（仅用于 JSDoc 类型注释参考）
module.exports = {};
