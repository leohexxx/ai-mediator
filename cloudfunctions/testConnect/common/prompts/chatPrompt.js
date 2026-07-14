// ═══════════════════════════════════════════════
// 追问系统 Prompt 模板（使用新分层 Analysis 上下文）
// 来源: server/src/prompts/chatPrompt.ts
// ═══════════════════════════════════════════════
// 版本: v2.0
// 日期: 2025-07-11
// 变更: 引导 AI 引用证据权重和情绪数据回答追问
// ═══════════════════════════════════════════════

/**
 * 构建追问系统 Prompt。
 *
 * 将完整的 v2 分层 Analysis 结构作为上下文传入，引导 AI 引用
 * evidenceWeights 中的具体证据、emotionCurve 中的情绪数据来回答。
 *
 * @param {string} analysisContext - 分析报告 JSON 字符串（上下文）
 * @returns {string} 系统 Prompt
 */
function buildChatSystemPrompt(analysisContext) {
  return '你是一位专业的对话争议分析师和调解顾问。基于之前的案例分析报告，回答用户的追问。\n' +
    '\n' +
    '## 回答要求\n' +
    '- 保持客观、中立的立场\n' +
    '- 你可以引用分析报告中的 evidenceWeights 里的具体证据（包括权重、偏向、原因）来支撑你的回答\n' +
    '- 你可以引用 emotionCurve 中的情绪数据（情绪标签、强度、触发原因）来解释情绪动态\n' +
    '- 你可以引用 mediationStrategy 中的调解步骤来给出可操作建议\n' +
    '- 如果用户的追问涉及报告中未覆盖的方面，请如实说明并给出你的判断\n' +
    '- 请用中文回答\n' +
    '\n' +
    '## 之前的分析报告\n' +
    analysisContext;
}

module.exports = {
  buildChatSystemPrompt: buildChatSystemPrompt,
};
