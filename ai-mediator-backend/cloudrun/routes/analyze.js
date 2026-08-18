// 分析路由：事务获取案件级分析锁，实际计算由可恢复 Worker 执行。
var express = require('express');
var router = express.Router();
var auth = require('../middleware/auth');
var caseAccess = require('../services/caseAccess');
var workflow = require('../services/workflow').createWorkflow();

router.use(auth.requireAuth);

router.post('/start', async function (req, res, next) {
  try {
    var body = req.body || {};
    if (!body.caseId) return res.status(400).json({ code: -1, errorCode: 'CASE_ID_REQUIRED', data: null, message: '缺少 caseId' });
    var result = await workflow.startAnalysis({
      caseId: body.caseId,
      openid: req.openid,
      evidenceRevision: body.evidenceRevision,
      deep: body.deep === true,
      idempotencyKey: body.idempotencyKey || '',
    });
    var analysis = result.analysis;
    res.status(result.duplicate ? 200 : 202).json({
      code: 0,
      data: {
        analysisId: analysis._id,
        status: analysis.status,
        lockedEvidenceRevision: analysis.lockedEvidenceRevision,
        startedBy: analysis.startedBy,
        singlePartyEvidence: analysis.singlePartyEvidence,
        duplicate: result.duplicate,
      },
      message: 'ok',
    });
    if (!result.duplicate) {
      req.app.locals.analysisWorker.kick().catch(function (error) {
        console.error('[Analyze] worker kick failed:', error.message);
      });
    }
  } catch (error) { next(error); }
});

router.post('/:id/cancel', async function (req, res, next) {
  try {
    var result = await workflow.cancelAnalysis({ analysisId: req.params.id, openid: req.openid });
    res.status(result.status === 'cancel_requested' ? 202 : 200).json({ code: 0, data: result, message: 'ok' });
  } catch (error) { next(error); }
});

router.get('/:id', async function (req, res, next) {
  try {
    var analysis = await caseAccess.getAnalysisForUser(req.params.id, req.openid);
    res.json({ code: 0, data: analysis, message: 'ok' });
  } catch (error) { next(error); }
});

module.exports = router;
