// ═══════════════════════════════════════════════
// Analysis V1 → V2 迁移工具
// 来源: src/utils/analysisMigration.ts
// 纯函数：不修改原对象，返回新的 v2 结构对象
// ═══════════════════════════════════════════════

/**
 * 判断 Analysis 是否已经是 v2 结构。
 * 规则：schemaVersion === 'v2' 即为 v2；
 * 无 schemaVersion 字段或 === 'v1' 则为 v1。
 *
 * @param {*} analysis
 * @returns {boolean}
 */
function isV2(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;
  return analysis.schemaVersion === 'v2';
}

/**
 * 将 V1 Character 转换为 V2 Character（补充 communicationStyle）
 * @param {Object} c
 * @returns {Object}
 */
function migrateCharacter(c) {
  return {
    name: c.name,
    role: c.role,
    personality: c.personality,
    stance: c.stance,
    emotionalState: c.emotionalState,
    communicationStyle: '未知（旧格式数据无此字段）',
  };
}

/**
 * 将 V1 Conflict 转换为 V2 Conflict（补充 severity）
 * @param {Object} c
 * @returns {Object}
 */
function migrateConflict(c) {
  return {
    topic: c.topic,
    partyAStance: c.partyAStance,
    partyBStance: c.partyBStance,
    aiJudgment: c.aiJudgment,
    winner: c.winner,
    severity: 'medium',
  };
}

/**
 * 将 V1 TimelineEvent 转换为 V2 TimelineEvent（补充 isTurningPoint）
 * @param {Object} e
 * @returns {Object}
 */
function migrateTimelineEvent(e) {
  return {
    timestamp: e.timestamp,
    speaker: e.speaker,
    content: e.content,
    emotion: e.emotion,
    significance: e.significance,
    isTurningPoint: false,
  };
}

/**
 * 将 V1 Analysis 迁移为 V2 Analysis 结构。
 *
 * 迁移映射：
 * - v1.verdict → v2.coreConclusion
 * - v1.summary + v1.relationship + v1.characters + v1.timeline + v1.conflicts → v2.detailedAnalysis
 * - v1 缺失的 evidenceWeights/emotionCurve/mediationStrategy 填充空数组
 * - confidence 默认 50，confidenceReasons 默认提示信息
 *
 * 此函数不修改原对象，返回新对象。
 *
 * @param {Object} v1 - V1 格式 Analysis
 * @returns {Object} V2 格式 Analysis
 */
function migrateV1ToV2(v1) {
  var verdict = v1.verdict;

  var coreConclusion = {
    overallWinner: verdict.overallWinner,
    scoreA: verdict.scoreA,
    scoreB: verdict.scoreB,
    oneLineVerdict: verdict.summary,
    keyReasons: verdict.reasoning || [],
    recommendedAction: (v1.advice && v1.advice.toBoth && v1.advice.toBoth[0]) || '请参考下方调解建议',
    confidence: 50,
    confidenceReasons: ['旧格式分析，无置信度数据'],
  };

  var characters = (v1.characters || []).map(migrateCharacter);
  var conflicts = (v1.conflicts || []).map(migrateConflict);
  var timeline = (v1.timeline || []).map(migrateTimelineEvent);

  var detailedAnalysis = {
    summary: v1.summary || '',
    relationship: v1.relationship || '',
    characters: characters,
    conflicts: conflicts,
    timeline: timeline,
  };

  return {
    id: v1.id,
    caseId: v1.caseId,
    createdAt: v1.createdAt,
    schemaVersion: 'v2',
    coreConclusion: coreConclusion,
    evidenceWeights: [],
    emotionCurve: [],
    mediationStrategy: [],
    detailedAnalysis: detailedAnalysis,
    advice: v1.advice || { toA: [], toB: [], toBoth: [] },
  };
}

/**
 * 安全获取渲染用的 Analysis。
 * 如果已经是 v2，直接返回；如果是 v1 或无 schemaVersion，迁移后返回。
 *
 * @param {Object|null|undefined} analysis
 * @returns {Object|null}
 */
function ensureV2(analysis) {
  if (!analysis) return null;
  if (isV2(analysis)) return analysis;
  return migrateV1ToV2(analysis);
}

module.exports = {
  isV2: isV2,
  migrateV1ToV2: migrateV1ToV2,
  ensureV2: ensureV2,
};
