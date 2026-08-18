// ═══════════════════════════════════════════════
// 分析路由 — 启动、查询、进度推送
// ═══════════════════════════════════════════════
var express = require('express');
var router = express.Router();
var llm = require('../services/llm');
var config = require('../config');
var db = require('../services/db');
var parser = require('../utils/chatFormatter');
var auth = require('../middleware/auth');
var caseAccess = require('../services/caseAccess');

router.use(auth.requireAuth);

// ── 分析提示词（简化版，完整版参考原 analysisPrompt.js）──
var ANALYSIS_SYSTEM_PROMPT = '你是一位专业的对话争议分析师，同时精通 MBTI 性格类型学和星座性格分析。' +
  '请从聊天记录中分析：核心结论、性格分析、关键证据、情绪轨迹、调解策略和建议。' +
  '用中文输出 JSON 格式。';

var ANALYSIS_USER_TEMPLATE = '## 案件背景\n{{caseContext}}\n\n## 聊天记录\n{{chatText}}\n\n' +
  '请分析以上聊天记录，输出包含以下字段的 JSON（不要使用 markdown 代码块）：\n' +
  '{\n' +
  '  "coreConclusion": { "overallWinner":"a/b/tie", "scoreA":0, "scoreB":0, "oneLineVerdict":"...", "keyReasons":[], "recommendedAction":"...", "confidence":0, "confidenceReasons":[] },\n' +
  '  "evidenceWeights": [{ "id":"ev_w_1", "speaker":"...", "content":"...", "timestamp":"...", "weight":85, "weightReason":"...", "favors":"a/b/neutral" }],\n' +
  '  "emotionCurve": [{ "speaker":"...", "points":[{ "timestamp":"...", "emotion":"...", "intensity":70, "trigger":"..." }] }],\n' +
  '  "mediationStrategy": [{ "step":1, "title":"...", "description":"...", "target":"a/b/both", "expectedOutcome":"...", "difficulty":"easy/medium/hard" }],\n' +
  '  "detailedAnalysis": { "summary":"...", "relationship":"...", "characters":[], "conflicts":[], "timeline":[] },\n' +
  '  "advice": { "toA":[], "toB":[], "toBoth":[] }\n' +
  '}';

/**
 * POST /api/analyze/start
 * 启动分析。创建记录后异步执行完整流水线，通过 WebSocket 推送进度。
 */
router.post('/start', caseAccess.requireCaseAccess, async function (req, res, next) {
  try {
    var { caseId, deep } = req.body;

    // 1. 案例权限已由 requireCaseAccess 校验。
    var caseData = req.caseData;

    var evidenceRes = await db.collection('evidence').where({ caseId: caseId, party: 'party_a' }).get();
    var messagesA = (evidenceRes.data && evidenceRes.data[0] && evidenceRes.data[0].parsedMessages) || [];
    var allMessages = messagesA.slice();
    // 双人模式: 合并乙方证据
    var hasPartyB = caseData.party_b && caseData.party_b.openid;
    if (hasPartyB) {
      var evB = await db.collection('evidence').where({ caseId: caseId, party: 'party_b' }).get();
      if (evB.data && evB.data[0]) allMessages = allMessages.concat(evB.data[0].parsedMessages || []);
    }
    allMessages.sort(function (a, b) { return (a.timestamp || '').localeCompare(b.timestamp || ''); });

    var parties = [{ name: caseData.party_a.nickname || '甲方', role: 'party_a' }];
    if (!hasPartyB) { parties.push({ name: '对方', role: 'other_party' }); }
    else { parties.push({ name: caseData.party_b.nickname || '乙方', role: 'party_b' }); }

    var formatted = parser.formatChatForLLM(allMessages, parties);
    var caseContext = '关系: ' + (caseData.relationship || '未设置') + '\n案例标题: ' + (caseData.title || '调解案例');

    // 2. 创建分析记录
    var analysisRes = await db.collection('analyses').add({
      data: {
        caseId: caseId, schemaVersion: 'v2',
        mode: hasPartyB ? 'dual' : 'single', deep: !!deep,
        status: 'queued', coreConclusion: {},
        progress: { step: 'started', message: '分析已启动', progress: 0 },
        createdAt: new Date().toISOString(),
      },
    });
    var analysisId = analysisRes._id;
    var pushProgress = req.app.get('pushProgress');

    // 3. 返回 analysisId，流水线在后台运行
    res.status(202).json({ code: 0, data: { analysisId: analysisId, status: 'queued' } });

    // ════ 异步分析流水线 ════
    async function runPipeline() {
      try {
        await db.collection('analyses').doc(analysisId).update({ data: { status: 'running' } });
        pushProgress(analysisId, 'progress', { step: '格式化聊天记录', progress: 10 });

        // 长文本先摘要
        var chatText = formatted;
        if (formatted.length > 8000) {
          pushProgress(analysisId, 'progress', { step: '正在压缩长文本...', progress: 20 });
          chatText = await llm.chatCompletion(
            '请压缩以下聊天记录，保留关键对话原文（说话人+时间戳），压缩为 1/3 长度。输出纯净文本。',
            [{ role: 'user', content: formatted }], 2048
          );
        }

        // 完整分析（一次 LLM 调用，不分阶段）
        pushProgress(analysisId, 'progress', { step: '正在分析性格与综合判断...', progress: 40 });
        var model = deep ? config.llm.deepModel : config.llm.model;
        var analysisText = await llm.chatCompletion(ANALYSIS_SYSTEM_PROMPT, [
          { role: 'user', content: ANALYSIS_USER_TEMPLATE.replace('{{caseContext}}', caseContext).replace('{{chatText}}', chatText) },
        ], 8192, model);

        // 解析 JSON
        pushProgress(analysisId, 'progress', { step: '正在提取证据与情绪...', progress: 70 });
        var jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('LLM 返回格式异常，未找到 JSON');
        var result = JSON.parse(jsonMatch[0]);

        // 单人模式调低置信度
        if (!hasPartyB && result.coreConclusion) {
          var cc = result.coreConclusion;
          cc.confidence = Math.max(30, (cc.confidence || 75) - 15);
          cc.confidenceReasons = ['(单人视角，已自动调低 15%)'].concat(cc.confidenceReasons || []);
        }

        // 写数据库
        pushProgress(analysisId, 'progress', { step: '正在制定调解策略...', progress: 90 });
        await db.collection('analyses').doc(analysisId).update({
          data: {
            coreConclusion: result.coreConclusion || {},
            evidenceWeights: result.evidenceWeights || [],
            emotionCurve: result.emotionCurve || [],
            mediationStrategy: result.mediationStrategy || [],
            detailedAnalysis: result.detailedAnalysis || {},
            advice: result.advice || { toA: [], toB: [], toBoth: [] },
            status: 'completed',
            progress: { step: 'done', message: '分析完成', progress: 100 },
          },
        });

        pushProgress(analysisId, 'done', { analysisId: analysisId, result: result });
        console.log('[Analyze] complete: ' + analysisId);

      } catch (pipelineErr) {
        console.error('[Analyze] pipeline error:', pipelineErr.message);
        await db.collection('analyses').doc(analysisId).update({
          data: {
            status: 'failed',
            progress: { step: 'error', message: '分析失败，请稍后重试', progress: 0 },
          },
        }).catch(function () {});
        pushProgress(analysisId, 'error', { message: pipelineErr.message });
      }
    }

    setImmediate(function () {
      runPipeline().catch(function (pipelineErr) {
        console.error('[Analyze] unexpected pipeline error:', pipelineErr.message);
      });
    });
    return;

  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analyze/:id
 * 获取分析结果
 */
router.get('/:id', async function (req, res, next) {
  try {
    var analysis = await caseAccess.getAnalysisForUser(req.params.id, req.openid);
    res.json({ code: 0, data: analysis, message: 'ok' });
  } catch (err) { next(err); }
});

module.exports = router;
