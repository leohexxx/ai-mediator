// 分析路由：事务入队，实际计算由可恢复的 analysisWorker 执行。
var express = require('express');
var uuid = require('uuid');
var router = express.Router();
var db = require('../services/db');
var auth = require('../middleware/auth');
var caseAccess = require('../services/caseAccess');

router.use(auth.requireAuth);

router.post('/start', caseAccess.requireCaseAccess, async function (req, res, next) {
  try {
    var caseId = req.body.caseId;
    var deep = req.body.deep === true;
    var force = req.body.force === true;

    var evidenceResult = await db.collection('evidence')
      .where({ caseId: caseId, party: 'party_a' })
      .limit(1)
      .get();
    if (!evidenceResult.data || evidenceResult.data.length === 0) {
      return res.status(400).json({ code: -1, data: null, message: '请先上传聊天记录再开始分析' });
    }

    var analysisId = uuid.v4();
    var now = new Date().toISOString();
    await db.runTransaction(async function (transaction) {
      var caseRef = transaction.collection('cases').doc(caseId);
      var latestResult = await caseRef.get();
      var latestCase = latestResult.data;
      if (!latestCase) throw new Error('案例不存在');

      var previousCaseStatus = latestCase.status;
      if (latestCase.status === 'analyzing' && latestCase.analysisId) {
        var existingResult = await transaction.collection('analyses').doc(latestCase.analysisId).get();
        var existing = existingResult.data;
        if (!force && existing && (existing.status === 'queued' || existing.status === 'running')) {
          var conflict = new Error('分析正在进行中，请稍候');
          conflict.status = 409;
          throw conflict;
        }
        if (existing && existing.job && existing.job.previousCaseStatus) {
          previousCaseStatus = existing.job.previousCaseStatus;
        }
      }

      var hasSubmittedPartyB = !!(latestCase.party_b && latestCase.party_b.openid && latestCase.party_b.submitted);
      var mode = hasSubmittedPartyB ? 'dual' : 'single';
      var isDebate = (latestCase.mode === 'dual' && latestCase.status === 'dual_a_submitted') ||
        !!(existing && existing.job && existing.job.isDebate);

      var analysisRef = transaction.collection('analyses').doc(analysisId);
      await analysisRef.set({ data: {
        caseId: caseId,
        schemaVersion: 'v3',
        mode: mode,
        deep: deep,
        status: 'queued',
        coreConclusion: {},
        progress: { step: 'queued', message: '分析已进入队列', progress: 0 },
        job: {
          attempts: 0,
          leaseOwner: null,
          leaseUntil: null,
          previousCaseStatus: previousCaseStatus,
          isDebate: isDebate,
        },
        createdAt: now,
        updatedAt: now,
      } });
      await caseRef.update({ data: { status: 'analyzing', analysisId: analysisId, updatedAt: now } });
    });

    res.status(202).json({ code: 0, data: { analysisId: analysisId, status: 'queued' }, message: 'ok' });
    req.app.locals.analysisWorker.kick().catch(function (error) {
      console.error('[Analyze] worker kick failed:', error.message);
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async function (req, res, next) {
  try {
    var analysis = await caseAccess.getAnalysisForUser(req.params.id, req.openid);
    res.json({ code: 0, data: analysis, message: 'ok' });
  } catch (err) { next(err); }
});

module.exports = router;
