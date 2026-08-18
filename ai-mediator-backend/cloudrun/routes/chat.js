var express = require('express');
var uuid = require('uuid');
var router = express.Router();
var llm = require('../services/llm');
var db = require('../services/db');
var auth = require('../middleware/auth');
var caseAccess = require('../services/caseAccess');
var participantRole = require('../services/workflow').participantRole;

router.use(auth.requireAuth);
var activeControllers = {};

var CHAT_SYSTEM_PROMPT = '你是一位专业的对话调解助手。用户正在查看一份聊天分析报告，你可以结合报告内容回答问题、提供建议或解释分析逻辑。请用中文回答，语气温和但专业。';

async function sendMessage(req, res, next) {
  var body = req.body || {};
  var jobId = body.jobId || uuid.v4();
  var threadId = body.threadId || ('case_' + body.caseId);
  try {
    if (!body.caseId) return res.status(400).json({ code: -1, errorCode: 'CASE_ID_REQUIRED', data: null, message: '缺少 caseId' });
    if (!body.analysisId) return res.status(400).json({ code: -1, errorCode: 'ANALYSIS_ID_REQUIRED', data: null, message: '缺少 analysisId' });
    if (!body.message || !body.message.trim()) return res.status(400).json({ code: -1, errorCode: 'MESSAGE_REQUIRED', data: null, message: '请输入消息' });
    var caseData = await caseAccess.getCaseForUser(body.caseId, req.openid);
    var analysis = await caseAccess.getAnalysisForUser(body.analysisId, req.openid);
    if (analysis.caseId !== body.caseId) {
      return res.status(400).json({ code: -1, errorCode: 'ANALYSIS_CASE_MISMATCH', data: null, message: '分析任务与案例不匹配' });
    }
    var existing = await db.collection('chat_jobs').doc(jobId).get();
    if (existing.data && existing.data.status === 'completed') {
      return res.json({ code: 0, data: { jobId: jobId, threadId: threadId, status: 'completed', reply: existing.data.reply }, message: 'ok' });
    }

    var now = new Date().toISOString();
    var role = participantRole(caseData, req.openid);
    await db.collection('chat_jobs').doc(jobId).set({ data: {
      caseId: body.caseId, analysisId: body.analysisId, threadId: threadId,
      userId: req.openid, party: role, status: 'running', createdAt: now, updatedAt: now,
    } });
    var controller = new AbortController();
    activeControllers[jobId] = controller;
    await db.collection('conversation_messages').doc(jobId + '_user').set({ data: {
      caseId: body.caseId, analysisId: body.analysisId, threadId: threadId,
      jobId: jobId, userId: req.openid, party: role, role: 'user', content: body.message.trim(), createdAt: now,
    } });

    var historyResult = await db.collection('conversation_messages').where({ caseId: body.caseId }).get();
    var history = (historyResult.data || []).filter(function (item) { return item.threadId === threadId && item._id !== jobId + '_user'; })
      .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }).slice(-20)
      .map(function (item) { return { role: item.role === 'assistant' ? 'assistant' : 'user', content: item.content }; });
    var contextStr = JSON.stringify({
      coreConclusion: analysis.coreConclusion,
      evidenceCount: (analysis.evidenceWeights || []).length,
      summary: analysis.detailedAnalysis && analysis.detailedAnalysis.summary || '',
      evidenceRevision: analysis.evidenceRevision,
    });
    var beforeModel = await db.collection('chat_jobs').doc(jobId).get();
    if (controller.signal.aborted || !beforeModel.data || beforeModel.data.status === 'cancel_requested') {
      delete activeControllers[jobId];
      await db.collection('chat_jobs').doc(jobId).update({ data: { status: 'canceled', updatedAt: new Date().toISOString() } });
      return res.json({ code: 0, data: { jobId: jobId, threadId: threadId, status: 'canceled' }, message: 'ok' });
    }
    var reply = await llm.chatCompletion(CHAT_SYSTEM_PROMPT + '\n\n分析报告：' + contextStr,
      history.concat([{ role: 'user', content: body.message.trim() }]), 2048, null, { signal: controller.signal });
    delete activeControllers[jobId];

    var latestJob = await db.collection('chat_jobs').doc(jobId).get();
    if (!latestJob.data || latestJob.data.status === 'cancel_requested' || latestJob.data.status === 'canceled') {
      await db.collection('chat_jobs').doc(jobId).update({ data: { status: 'canceled', updatedAt: new Date().toISOString() } });
      return res.json({ code: 0, data: { jobId: jobId, threadId: threadId, status: 'canceled' }, message: 'ok' });
    }
    var completedAt = new Date().toISOString();
    await db.collection('conversation_messages').doc(jobId + '_assistant').set({ data: {
      caseId: body.caseId, analysisId: body.analysisId, threadId: threadId,
      jobId: jobId, userId: req.openid, party: 'ai', role: 'assistant', content: reply, createdAt: completedAt,
    } });
    await db.collection('chat_jobs').doc(jobId).update({ data: { status: 'completed', reply: reply, completedAt: completedAt, updatedAt: completedAt } });
    res.json({ code: 0, data: { jobId: jobId, threadId: threadId, status: 'completed', reply: reply }, message: 'ok' });
  } catch (error) {
    delete activeControllers[jobId];
    if (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')) {
      await Promise.resolve(db.collection('chat_jobs').doc(jobId).update({
        data: { status: 'canceled', updatedAt: new Date().toISOString() },
      })).catch(function () {});
      return res.json({ code: 0, data: { jobId: jobId, threadId: threadId, status: 'canceled' }, message: 'ok' });
    }
    next(error);
  }
}

router.post('/', sendMessage);
router.post('/messages', sendMessage);

router.post('/:jobId/cancel', async function (req, res, next) {
  try {
    var jobResult = await db.collection('chat_jobs').doc(req.params.jobId).get();
    var job = jobResult.data;
    if (!job) return res.status(404).json({ code: -1, errorCode: 'CHAT_JOB_NOT_FOUND', data: null, message: '追问任务不存在' });
    await caseAccess.getCaseForUser(job.caseId, req.openid);
    if (job.status === 'completed') return res.status(409).json({ code: -1, errorCode: 'CHAT_ALREADY_COMPLETED', data: null, message: '回答已经完成' });
    await db.collection('chat_jobs').doc(req.params.jobId).update({ data: {
      status: 'cancel_requested', cancelRequestedBy: req.openid, cancelRequestedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } });
    if (activeControllers[req.params.jobId]) activeControllers[req.params.jobId].abort();
    res.status(202).json({ code: 0, data: { jobId: req.params.jobId, status: 'cancel_requested' }, message: 'ok' });
  } catch (error) { next(error); }
});

router.get('/case/:caseId/messages', async function (req, res, next) {
  try {
    await caseAccess.getCaseForUser(req.params.caseId, req.openid);
    var result = await db.collection('conversation_messages').where({ caseId: req.params.caseId }).get();
    var messages = (result.data || []).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }).slice(-100);
    res.json({ code: 0, data: { messages: messages }, message: 'ok' });
  } catch (error) { next(error); }
});

module.exports = router;
