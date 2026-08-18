var uuid = require('uuid');
var crypto = require('crypto');
var defaultDb = require('./db');
var config = require('../config');

var LOCKED_STATUSES = ['analyzing', 'cancel_requested'];
var ACTIVE_ANALYSIS_STATUSES = ['queued', 'running', 'cancel_requested'];

function httpError(status, code, message) {
  var error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function participantRole(caseData, openid) {
  if (caseData && caseData.party_a && caseData.party_a.openid === openid) return 'party_a';
  if (caseData && caseData.party_b && caseData.party_b.openid === openid) return 'party_b';
  return null;
}

function isLocked(caseData) {
  return !!(caseData && (caseData.analysisLock === true || LOCKED_STATUSES.indexOf(caseData.status) !== -1));
}

async function queryAllEvidence(database, caseId) {
  var batches = await database.collection('evidence_batches').where({ caseId: caseId }).get();
  if (batches.data && batches.data.length) return batches.data;
  var legacy = await database.collection('evidence').where({ caseId: caseId }).get();
  return (legacy.data || []).map(function (item) {
    return Object.assign({}, item, { revision: 1, status: 'ready', legacy: true });
  });
}

function contributorsFor(items, maxRevision) {
  var found = {};
  (items || []).forEach(function (item) {
    var revision = Number(item.revision) || 1;
    if (revision <= maxRevision && item.status !== 'deleted' && item.parsedMessages && item.parsedMessages.length) {
      found[item.party] = true;
    }
  });
  return Object.keys(found).sort();
}

function buildEvidenceSummary(rawText) {
  var text = String(rawText || '').trim();
  if (text.length <= 6000) return text;
  var sliceLength = 1400;
  var starts = [0, Math.floor(text.length / 3), Math.floor(text.length * 2 / 3), Math.max(0, text.length - sliceLength)];
  return starts.map(function (start, index) {
    return '[摘要片段' + (index + 1) + ']\n' + text.slice(start, start + sliceLength);
  }).join('\n\n');
}

function createWorkflow(options) {
  options = options || {};
  var db = options.db || defaultDb;
  var makeId = options.makeId || uuid.v4;
  var rateLimitEnabled = options.rateLimitEnabled != null ? options.rateLimitEnabled : !config.localMode;

  async function appendEvidence(input) {
    var now = new Date().toISOString();
    var batchId = input.batchId || makeId();
    var result = await db.runTransaction(async function (transaction) {
      var caseRef = transaction.collection('cases').doc(input.caseId);
      var caseResult = await caseRef.get();
      var caseData = caseResult.data;
      if (!caseData) throw httpError(404, 'CASE_NOT_FOUND', '案例不存在');
      var role = participantRole(caseData, input.openid);
      if (!role) throw httpError(403, 'CASE_FORBIDDEN', '无权操作此案例');
      if (isLocked(caseData)) {
        throw httpError(423, 'EVIDENCE_LOCKED', 'AI正在分析，需先打断分析后才能补充证据');
      }

      if (input.idempotencyKey) {
        var duplicateResult = await transaction.collection('evidence_batches')
          .where({ caseId: input.caseId, idempotencyKey: input.idempotencyKey }).limit(1).get();
        if (duplicateResult.data && duplicateResult.data[0]) {
          return { batch: duplicateResult.data[0], duplicate: true };
        }
      }

      var existingEvidence = await queryAllEvidence(transaction, input.caseId);
      var existingImageCount = existingEvidence.reduce(function (sum, item) {
        return sum + ((item.fileIds && item.fileIds.length) || 0);
      }, 0);
      if (existingImageCount + (input.fileIds || []).length > config.ocr.maxImagesPerCase) {
        throw httpError(400, 'CASE_IMAGE_LIMIT', '每个案例最多上传' + config.ocr.maxImagesPerCase + '张图片');
      }

      var revision = (Number(caseData.evidenceRevision) || 0) + 1;
      var batch = {
        _id: batchId,
        caseId: input.caseId,
        party: role,
        revision: revision,
        rawText: input.rawText,
        analysisInputSummary: buildEvidenceSummary(input.rawText),
        parsedMessages: input.parsedMessages || [],
        fileIds: input.fileIds || [],
        sourceHashes: input.sourceHashes || [],
        perceptualHashes: input.perceptualHashes || [],
        ocrBlocks: input.ocrBlocks || [],
        note: input.note || '',
        status: 'ready',
        idempotencyKey: input.idempotencyKey || '',
        createdBy: input.openid,
        createdAt: now,
        updatedAt: now,
      };
      var batchData = Object.assign({}, batch);
      delete batchData._id;
      await transaction.collection('evidence_batches').doc(batchId).set({ data: batchData });

      var hasPartyB = !!(caseData.party_b && caseData.party_b.openid);
      var nextStatus = hasPartyB ? 'dual_collecting' : 'single_submitted';
      var updateData = {
        evidenceRevision: revision,
        lockedEvidenceRevision: null,
        analysisLock: false,
        status: nextStatus,
        updatedAt: now,
      };
      updateData[role + '.submitted'] = true;
      updateData[role + '.submittedAt'] = now;
      await caseRef.update({ data: updateData });
      return { batch: batch, duplicate: false };
    });
    return result;
  }

  async function startAnalysis(input) {
    var analysisId = input.analysisId || makeId();
    var now = new Date().toISOString();
    var result = await db.runTransaction(async function (transaction) {
      var caseRef = transaction.collection('cases').doc(input.caseId);
      var caseResult = await caseRef.get();
      var caseData = caseResult.data;
      if (!caseData) throw httpError(404, 'CASE_NOT_FOUND', '案例不存在');
      var role = participantRole(caseData, input.openid);
      if (!role) throw httpError(403, 'CASE_FORBIDDEN', '无权操作此案例');

      if (input.idempotencyKey) {
        var sameRequest = await transaction.collection('analyses')
          .where({ caseId: input.caseId, idempotencyKey: input.idempotencyKey }).limit(1).get();
        if (sameRequest.data && sameRequest.data[0]) {
          return { analysis: sameRequest.data[0], duplicate: true };
        }
      }

      if (isLocked(caseData)) {
        throw httpError(409, 'ANALYSIS_IN_PROGRESS', '对方或你已启动分析，请等待完成或先打断');
      }

      var rateLimitRef = null;
      var rateLimit = {};
      var withinWindow = false;
      var startCount = 0;
      if (rateLimitEnabled) {
        var rateLimitId = crypto.createHash('sha256').update(String(input.openid)).digest('hex');
        rateLimitRef = transaction.collection('analysis_rate_limits').doc(rateLimitId);
        var rateLimitResult = await rateLimitRef.get();
        rateLimit = rateLimitResult.data || {};
        var windowStartedAt = rateLimit.windowStartedAt ? new Date(rateLimit.windowStartedAt).getTime() : 0;
        withinWindow = Date.now() - windowStartedAt < 60000;
        startCount = withinWindow ? (Number(rateLimit.startCount) || 0) : 0;
        if (startCount >= config.analysisJobs.perUserStartsPerMinute) {
          throw httpError(429, 'ANALYSIS_RATE_LIMITED', '启动分析过于频繁，请稍后再试');
        }
      }

      var evidence = await queryAllEvidence(transaction, input.caseId);
      var revision = Number(caseData.evidenceRevision) || (evidence.length ? 1 : 0);
      if (input.evidenceRevision != null && Number(input.evidenceRevision) !== revision) {
        throw httpError(409, 'EVIDENCE_REVISION_CHANGED', '证据版本已变化，请刷新后重新提交');
      }
      var contributors = contributorsFor(evidence, revision);
      if (contributors.indexOf(role) === -1) {
        throw httpError(400, 'OWN_EVIDENCE_REQUIRED', '请先提交自己的证据再开始分析');
      }

      var hasPartyB = !!(caseData.party_b && caseData.party_b.openid);
      var caseMode = hasPartyB ? 'dual' : 'single';
      var previousStatus = caseData.status || (hasPartyB ? 'dual_collecting' : 'single_submitted');
      var analysis = {
        _id: analysisId,
        caseId: input.caseId,
        schemaVersion: 'v4',
        mode: caseMode,
        deep: input.deep === true,
        status: 'queued',
        evidenceRevision: revision,
        lockedEvidenceRevision: revision,
        evidenceContributors: contributors,
        singlePartyEvidence: contributors.length < 2,
        startedBy: role,
        startedByOpenid: input.openid,
        idempotencyKey: input.idempotencyKey || '',
        coreConclusion: {},
        progress: { step: 'queued', message: '分析已进入队列', progress: 0 },
        timings: { queuedAt: now },
        job: {
          attempts: 0,
          leaseOwner: null,
          leaseUntil: null,
          previousCaseStatus: previousStatus,
        },
        createdAt: now,
        updatedAt: now,
      };
      var analysisData = Object.assign({}, analysis);
      delete analysisData._id;
      await transaction.collection('analyses').doc(analysisId).set({ data: analysisData });
      if (rateLimitRef) {
        await rateLimitRef.set({ data: {
          windowStartedAt: withinWindow ? rateLimit.windowStartedAt : now,
          startCount: startCount + 1,
          updatedAt: now,
        } });
      }
      await caseRef.update({ data: {
        status: 'analyzing',
        analysisId: analysisId,
        activeAnalysisId: analysisId,
        analysisLock: true,
        lockedEvidenceRevision: revision,
        analysisStartedBy: role,
        analysisStartedAt: now,
        cancelRequestedBy: null,
        cancelRequestedAt: null,
        evidenceRevision: revision,
        updatedAt: now,
      } });
      return { analysis: analysis, duplicate: false };
    });
    return result;
  }

  async function cancelAnalysis(input) {
    var now = new Date().toISOString();
    return db.runTransaction(async function (transaction) {
      var analysisRef = transaction.collection('analyses').doc(input.analysisId);
      var analysisResult = await analysisRef.get();
      var analysis = analysisResult.data;
      if (!analysis) throw httpError(404, 'ANALYSIS_NOT_FOUND', '分析不存在');
      var caseRef = transaction.collection('cases').doc(analysis.caseId);
      var caseResult = await caseRef.get();
      var caseData = caseResult.data;
      var role = participantRole(caseData, input.openid);
      if (!role) throw httpError(403, 'CASE_FORBIDDEN', '无权打断此分析');
      if (analysis.status === 'completed') {
        throw httpError(409, 'ANALYSIS_ALREADY_COMPLETED', '本轮分析已完成，可直接补充证据并重新分析');
      }
      if (analysis.status === 'canceled') return { status: 'canceled', analysisId: input.analysisId };
      if (ACTIVE_ANALYSIS_STATUSES.indexOf(analysis.status) === -1) {
        throw httpError(409, 'ANALYSIS_NOT_ACTIVE', '当前分析不能被打断');
      }

      if (analysis.status === 'queued') {
        await analysisRef.update({ data: {
          status: 'canceled',
          progress: { step: 'canceled', message: '分析已打断，可以继续补充证据', progress: 0 },
          cancelRequestedBy: role,
          cancelRequestedAt: now,
          canceledAt: now,
          'job.leaseOwner': null,
          'job.leaseUntil': null,
          updatedAt: now,
        } });
        if (caseData.activeAnalysisId === input.analysisId || caseData.analysisId === input.analysisId) {
          await caseRef.update({ data: {
            status: caseData.party_b && caseData.party_b.openid ? 'dual_collecting' : 'single_submitted',
            analysisLock: false,
            activeAnalysisId: null,
            lockedEvidenceRevision: null,
            cancelRequestedBy: role,
            cancelRequestedAt: now,
            updatedAt: now,
          } });
        }
        return { status: 'canceled', analysisId: input.analysisId };
      }

      await analysisRef.update({ data: {
        status: 'cancel_requested',
        progress: { step: 'cancel_requested', message: '正在打断分析...', progress: 0 },
        cancelRequestedBy: role,
        cancelRequestedAt: now,
        updatedAt: now,
      } });
      if (caseData.activeAnalysisId === input.analysisId || caseData.analysisId === input.analysisId) {
        await caseRef.update({ data: {
          status: 'cancel_requested',
          cancelRequestedBy: role,
          cancelRequestedAt: now,
          updatedAt: now,
        } });
      }
      return { status: 'cancel_requested', analysisId: input.analysisId };
    });
  }

  return {
    appendEvidence: appendEvidence,
    startAnalysis: startAnalysis,
    cancelAnalysis: cancelAnalysis,
    queryAllEvidence: function (caseId) { return queryAllEvidence(db, caseId); },
  };
}

module.exports = {
  createWorkflow: createWorkflow,
    participantRole: participantRole,
    buildEvidenceSummary: buildEvidenceSummary,
  isLocked: isLocked,
  contributorsFor: contributorsFor,
  httpError: httpError,
};
