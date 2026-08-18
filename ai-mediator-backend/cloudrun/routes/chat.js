// ═══════════════════════════════════════════════
// 对话路由 — 基于分析结果的交互式对话
// ═══════════════════════════════════════════════
var express = require('express');
var router = express.Router();
var llm = require('../services/llm');
var auth = require('../middleware/auth');
var caseAccess = require('../services/caseAccess');

router.use(auth.requireAuth);

var CHAT_SYSTEM_PROMPT = '你是一位专业的对话调解助手。用户正在查看一份聊天分析报告，你可以结合报告内容回答用户的问题、提供建议、或解释分析逻辑。请用中文回答，语气温和但专业。';

/**
 * POST /api/chat
 * 与 AI 对话（基于已有分析结果）
 * Body: { analysisId, message, history? }
 */
router.post('/', async function (req, res, next) {
  try {
    var { analysisId, message, history } = req.body;
    if (!analysisId) return res.status(400).json({ code: -1, data: null, message: '缺少 analysisId' });
    if (!message) return res.status(400).json({ code: -1, data: null, message: '请输入消息' });

    // 获取分析结果作为上下文
    var a = await caseAccess.getAnalysisForUser(analysisId, req.openid);
    var contextStr = '分析报告摘要：\n' + JSON.stringify({
      coreConclusion: a.coreConclusion,
      evidenceCount: (a.evidenceWeights || []).length,
      strategyCount: (a.mediationStrategy || []).length,
      summary: (a.detailedAnalysis && a.detailedAnalysis.summary) || '',
      relationship: (a.detailedAnalysis && a.detailedAnalysis.relationship) || '',
    }, null, 2);

    var messages = [{ role: 'system', content: CHAT_SYSTEM_PROMPT + '\n\n' + contextStr }];
    if (history && Array.isArray(history)) {
      for (var i = 0; i < history.length; i++) {
        messages.push({ role: history[i].role, content: history[i].content });
      }
    }
    messages.push({ role: 'user', content: message });

    var reply = await llm.chatCompletion(null, messages, 2048);
    res.json({ code: 0, data: { reply: reply }, message: 'ok' });
  } catch (err) { next(err); }
});

module.exports = router;
