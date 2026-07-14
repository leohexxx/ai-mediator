// ═══════════════════════════════════════════════
// 分阶段分析 Prompt 模板（v3 — 流水线版）
// ═══════════════════════════════════════════════
// 版本: v3.0
// 变更: 从单次大 prompt 拆为「摘要(可选) → 核心 → 证据 → 策略」分阶段，
//       每阶段输出受控、maxTokens 下调，单阶段稳定 < 60s，避开云函数超时。
// ═══════════════════════════════════════════════

var COMMON_PREAMBLE =
  '你是一位专业的对话争议分析师，同时精通 MBTI 性格类型学和星座性格分析。' +
  '你的专长是从聊天记录中提取关键证据、分析情绪动态、结合双方性格特质给出客观判断和可操作的调解方案。\n\n';

// 长文本阈值（字符数）。超过则先做一次摘要再分析，避免单阶段输入过大、首 token 过慢。
var SUMMARIZE_THRESHOLD = 8000;

// ── 阶段定义 ────────────────────────────────────────
var STAGES = {
  summarize: { maxTokens: 2048 },
  core: { maxTokens: 2560 },      // 理解对话 + 性格 + 综合判断
  evidence: { maxTokens: 2560 },  // 证据 + 情绪 + 冲突 + 时间线（精简后 2560 足够）
  strategy: { maxTokens: 2048 },  // 调解策略 + 建议
};

/**
 * 构建案件背景 + 当事人信息段（各阶段通用）
 */
function buildContextBlock(caseContext, parties) {
  var partyInfo = parties
    .map(function (p) {
      return '- ' + (p.role === 'party_a' ? '甲方' : '乙方') + ': ' + p.name;
    })
    .join('\n');

  return '## 案件背景\n' +
    (caseContext || '无额外背景信息') + '\n\n' +
    '## 当事人信息\n' + partyInfo + '\n';
}

/**
 * 长文本摘要 Prompt：产出"关键对话摘录 + 简要叙述"，保留说话人/时间戳/原文，
 * 供后续阶段使用。不丢关键证据，但大幅压缩篇幅。
 */
function buildSummarizeUserPrompt(formattedChat, parties, caseContext) {
  return COMMON_PREAMBLE +
    '## 任务\n' +
    '下面的聊天记录较长。请先做一次结构化压缩，供后续分析使用。要求：\n' +
    '1. 挑出对判断争议最关键的 30-50 条对话，**逐条保留原文**，保留说话人标签与时间戳；\n' +
    '2. 在开头用 2-3 句话概述关系背景、争议焦点、双方核心诉求；\n' +
    '3. 标注 3-5 个情绪/冲突转折点；\n' +
    '4. 不要做最终评判，只做忠实压缩。\n\n' +
    buildContextBlock(caseContext, parties) + '\n' +
    '## 聊天记录\n' + formattedChat + '\n\n' +
    '请直接输出压缩后的文本（不要 JSON、不要 markdown 代码块）。开头先写"概述："，再写"关键对话："。';
}

/**
 * 第一阶段：核心结论 + 案情摘要 + 人物性格分析
 */
function buildCoreUserPrompt(chatText, parties, caseContext) {
  return COMMON_PREAMBLE +
    '## 本阶段任务（第一阶段：理解 + 性格 + 综合判断）\n' +
    '1. 通读聊天记录，识别双方昵称、角色、关系与对话走向；\n' +
    '2. 结合案件背景中的 MBTI 与星座信息，分析双方性格特质，并与聊天中的实际行为对照；\n' +
    '3. 基于证据与性格，给出综合评分（scoreA + scoreB = 100）与置信度；\n' +
    '4. oneLineVerdict 与 keyReasons 中要融入性格维度。\n\n' +
    '## 评分规则\n' +
    '- scoreA + scoreB = 100，分数高的一方更有理；\n' +
    '- 基于客观事实判断，不要被情绪化语言左右；\n' +
    '- 置信度 ≥75 高置信，50-74 中置信，<50 低置信；聊天记录可能不完整，在置信度中体现。\n\n' +
    buildContextBlock(caseContext, parties) + '\n' +
    '## 聊天记录\n' + chatText + '\n\n' +
    '## 输出要求\n' +
    '请严格输出以下 JSON（不要任何其他文字、不要 markdown 代码块）：\n\n' +
    '{\n' +
    '  "coreConclusion": {\n' +
    '    "overallWinner": "a 或 b 或 tie",\n' +
    '    "scoreA": 60,\n' +
    '    "scoreB": 40,\n' +
    '    "oneLineVerdict": "一句话总结谁更有理及核心原因",\n' +
    '    "keyReasons": ["核心原因1", "核心原因2", "核心原因3"],\n' +
    '    "recommendedAction": "建议的下一步行动",\n' +
    '    "confidence": 75,\n' +
    '    "confidenceReasons": ["置信度原因1", "置信度原因2"]\n' +
    '  },\n' +
    '  "summary": "案情摘要",\n' +
    '  "relationship": "人物关系（如：情侣、朋友、同事、家人等）",\n' +
    '  "characters": [\n' +
    '    {\n' +
    '      "name": "人物名称",\n' +
    '      "role": "party_a 或 party_b 或 other",\n' +
    '      "personality": "结合 MBTI 与星座分析天然性格倾向，再对照聊天实际表现，说明是否一致及如何影响其立场",\n' +
    '      "stance": "其核心立场和诉求",\n' +
    '      "emotionalState": "当前情绪状态",\n' +
    '      "communicationStyle": "沟通风格分析"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n请用中文输出。';
}

/**
 * 第二阶段：关键证据 + 情绪轨迹 + 冲突点 + 时间线
 * @param priorContext 第一阶段的 compact JSON（coreConclusion + characters）
 */
function buildEvidenceUserPrompt(chatText, parties, caseContext, priorContext) {
  return COMMON_PREAMBLE +
    '## 本阶段任务（第二阶段：证据 + 情绪 + 冲突 + 时间线）\n' +
    '1. 找出 3-4 条对判断有决定性影响的关键对话，评估权重(0-100)与偏向，content 用原文但可适度精简；\n' +
    '2. 为每一方建立情绪轨迹（3-4 个转折点），标注触发原因与强度(0-100)；\n' +
    '3. 梳理 2-3 个争议话题（conflicts）与 3-5 条关键时间线（timeline）；\n' +
    '4. 结合性格特质说明证据与情绪反应模式（如水象敏感、T 型逻辑化处理情绪）。\n' +
    '注意：输出必须完整，不要省略任何字段，确保 JSON 闭合。\n\n' +
    '## 评分规则\n' +
    '- 证据权重 ≥80 决定性证据，60-79 重要证据，<60 辅助证据。\n\n' +
    '## 第一阶段结论（已产出，请保持一致）\n' +
    priorContext + '\n\n' +
    buildContextBlock(caseContext, parties) + '\n' +
    '## 聊天记录\n' + chatText + '\n\n' +
    '## 输出要求\n' +
    '请严格输出以下 JSON（不要任何其他文字、不要 markdown 代码块）：\n\n' +
    '{\n' +
    '  "evidenceWeights": [\n' +
    '    { "id": "ev_w_1", "speaker": "说话人", "content": "关键对话原文", "timestamp": "时间或null", "weight": 85, "weightReason": "为什么重要", "favors": "a 或 b 或 neutral" }\n' +
    '  ],\n' +
    '  "emotionCurve": [\n' +
    '    { "speaker": "说话人", "points": [ { "timestamp": "时间或null", "emotion": "情绪标签", "intensity": 70, "trigger": "触发原因" } ] }\n' +
    '  ],\n' +
    '  "conflicts": [\n' +
    '    { "topic": "争议话题", "partyAStance": "甲方立场", "partyBStance": "乙方立场", "aiJudgment": "AI客观判断", "winner": "a 或 b 或 tie", "severity": "low 或 medium 或 high" }\n' +
    '  ],\n' +
    '  "timeline": [\n' +
    '    { "timestamp": "时间", "speaker": "说话人", "content": "关键对话摘要", "emotion": "情绪标签", "significance": "为什么重要", "isTurningPoint": false }\n' +
    '  ]\n' +
    '}\n\n请用中文输出。';
}

/**
 * 第三阶段：调解策略 + 建议
 * @param priorContext 第一、二阶段的 compact JSON
 */
function buildStrategyUserPrompt(chatText, parties, caseContext, priorContext) {
  return COMMON_PREAMBLE +
    '## 本阶段任务（第三阶段：调解策略 + 建议）\n' +
    '1. 设计 3-5 步调解方案，每步有具体操作、针对方、预期效果、执行难度；\n' +
    '2. 根据双方性格特质给出符合其沟通偏好的建议（如内向型建议书面沟通、情感型先肯定感受再讨论事实）；\n' +
    '3. 给出分别针对甲、乙、双方的具体建议。\n\n' +
    '## 前序阶段结论（已产出，请保持一致）\n' +
    priorContext + '\n\n' +
    buildContextBlock(caseContext, parties) + '\n' +
    '## 聊天记录\n' + chatText + '\n\n' +
    '## 输出要求\n' +
    '请严格输出以下 JSON（不要任何其他文字、不要 markdown 代码块）：\n\n' +
    '{\n' +
    '  "mediationStrategy": [\n' +
    '    { "step": 1, "title": "步骤标题", "description": "具体做什么", "target": "a 或 b 或 both", "expectedOutcome": "预期效果", "difficulty": "easy 或 medium 或 hard" }\n' +
    '  ],\n' +
    '  "advice": {\n' +
    '    "toA": ["结合甲方性格特质的具体建议1", "建议2"],\n' +
    '    "toB": ["结合乙方性格特质的具体建议1", "建议2"],\n' +
    '    "toBoth": ["双方基于性格差异应共同注意的事项"]\n' +
    '  }\n' +
    '}\n\n请用中文输出。';
}

/**
 * 统一入口：按阶段构建 user prompt
 * @param {string} stage - 'summarize' | 'core' | 'evidence' | 'strategy'
 */
function buildStageUserPrompt(stage, chatText, parties, caseContext, priorContext) {
  if (stage === 'summarize') return buildSummarizeUserPrompt(chatText, parties, caseContext);
  if (stage === 'core') return buildCoreUserPrompt(chatText, parties, caseContext);
  if (stage === 'evidence') return buildEvidenceUserPrompt(chatText, parties, caseContext, priorContext || '');
  if (stage === 'strategy') return buildStrategyUserPrompt(chatText, parties, caseContext, priorContext || '');
  throw new Error('Unknown stage: ' + stage);
}

function getStageMaxTokens(stage) {
  return (STAGES[stage] && STAGES[stage].maxTokens) || 2560;
}

// ── 兼容旧接口（单次大 prompt，仅保留给老测试/回退）────────
var ANALYSIS_PROMPT = COMMON_PREAMBLE +
  '## 分析流程\n理解对话 → 性格特质分析 → 提取关键证据 → 追踪情绪 → 综合判断 → 制定策略。\n\n' +
  '请输出包含 coreConclusion / evidenceWeights / emotionCurve / mediationStrategy / detailedAnalysis / advice 的完整 JSON。';

function buildAnalysisUserPrompt(formattedChat, parties, caseContext) {
  return ANALYSIS_PROMPT + '\n\n---\n' +
    buildContextBlock(caseContext, parties) + '\n' +
    '## 聊天记录\n' + formattedChat + '\n---\n请分析以上聊天记录，输出 JSON 格式的分析结果。';
}

module.exports = {
  SUMMARIZE_THRESHOLD: SUMMARIZE_THRESHOLD,
  STAGES: STAGES,
  buildStageUserPrompt: buildStageUserPrompt,
  getStageMaxTokens: getStageMaxTokens,
  // 兼容
  ANALYSIS_PROMPT: ANALYSIS_PROMPT,
  buildAnalysisUserPrompt: buildAnalysisUserPrompt,
};
