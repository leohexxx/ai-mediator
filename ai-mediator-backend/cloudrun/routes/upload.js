// ═══════════════════════════════════════════════
// 上传路由 — 图片 OCR / 视频抽帧 / 文本上传
// ═══════════════════════════════════════════════
var express = require('express');
var router = express.Router();
var multer = require('multer');
var path = require('path');
var fs = require('fs');
var os = require('os');
var config = require('../config');
var ocrService = require('../services/ocr');
var videoService = require('../services/video');
var parser = require('../utils/chatFormatter');
var auth = require('../middleware/auth');
var caseAccess = require('../services/caseAccess');
var db = require('../services/db');
var metrics = require('../services/metrics');
var evidenceStorage = require('../services/evidenceStorage');
var uuid = require('uuid');

router.use(auth.requireAuth);

router.post('/ocr-jobs', caseAccess.requireCaseAccess, async function (req, res, next) {
  try {
    var body = req.body || {};
    var fileIds = body.fileIds || [];
    if (!Array.isArray(fileIds) || !fileIds.length) {
      return res.status(400).json({ code: -1, errorCode: 'FILE_IDS_REQUIRED', data: null, message: '请先上传图片后再识别' });
    }
    if (fileIds.length > config.ocr.maxImagesPerBatch) {
      return res.status(400).json({ code: -1, errorCode: 'IMAGE_BATCH_LIMIT', data: null, message: '每批最多上传' + config.ocr.maxImagesPerBatch + '张图片' });
    }
    if (!fileIds.every(function (fileId) { return evidenceStorage.isCaseEvidenceFileId(fileId, body.caseId); })) {
      return res.status(400).json({ code: -1, errorCode: 'INVALID_EVIDENCE_FILE', data: null, message: '图片不属于当前案例，无法识别' });
    }
    var idempotencyKey = String(body.idempotencyKey || '');
    if (idempotencyKey) {
      var existing = await db.collection('ocr_jobs').where({
        caseId: body.caseId, requestedBy: req.openid, idempotencyKey: idempotencyKey,
      }).limit(1).get();
      if (existing.data && existing.data[0]) {
        return res.json({ code: 0, data: { jobId: existing.data[0]._id, status: existing.data[0].status, duplicate: true }, message: 'ok' });
      }
    }
    var previous = await db.collection('evidence_batches').where({ caseId: body.caseId }).get();
    var exactHashes = (body.knownExactHashes || []).slice();
    var perceptualHashes = (body.knownPerceptualHashes || []).slice();
    (previous.data || []).forEach(function (batch) {
      exactHashes = exactHashes.concat(batch.sourceHashes || []);
      perceptualHashes = perceptualHashes.concat(batch.perceptualHashes || []);
    });
    var jobId = uuid.v4();
    var now = new Date().toISOString();
    await db.collection('ocr_jobs').doc(jobId).set({ data: {
      caseId: body.caseId,
      requestedBy: req.openid,
      fileIds: fileIds,
      knownExactHashes: Array.from(new Set(exactHashes.filter(Boolean))),
      knownPerceptualHashes: Array.from(new Set(perceptualHashes.filter(Boolean))),
      idempotencyKey: idempotencyKey,
      status: 'queued',
      progress: { current: 0, total: fileIds.length, message: '识别任务已进入队列' },
      result: null,
      job: { attempts: 0, leaseOwner: null, leaseUntil: null },
      createdAt: now,
      updatedAt: now,
    } });
    res.status(202).json({ code: 0, data: { jobId: jobId, status: 'queued', duplicate: false }, message: 'ok' });
    req.app.locals.ocrWorker.kick().catch(function (error) {
      console.error('[Upload] OCR worker kick failed:', error.message);
    });
  } catch (error) { next(error); }
});

router.get('/ocr-jobs/:id', async function (req, res, next) {
  try {
    var result = await db.collection('ocr_jobs').doc(req.params.id).get();
    var job = result.data;
    if (!job) return res.status(404).json({ code: -1, errorCode: 'OCR_JOB_NOT_FOUND', data: null, message: '识别任务不存在' });
    await caseAccess.getCaseForUser(job.caseId, req.openid);
    res.json({ code: 0, data: {
      jobId: job._id,
      caseId: job.caseId,
      status: job.status,
      progress: job.progress,
      result: job.status === 'completed' ? job.result : null,
      errorCode: job.errorCode || '',
      errorMessage: job.errorMessage || '',
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }, message: 'ok' });
  } catch (error) { next(error); }
});

router.post('/ocr-batch', caseAccess.requireCaseAccess, async function (req, res, next) {
  try {
    var body = req.body || {};
    var fileIds = body.fileIds || [];
    var images = body.images || [];
    if ((!Array.isArray(fileIds) || fileIds.length === 0) && (!Array.isArray(images) || images.length === 0)) {
      return res.status(400).json({ code: -1, errorCode: 'IMAGES_REQUIRED', data: null, message: '未提供图片' });
    }
    var imageCount = fileIds.length || images.length;
    if (imageCount > config.ocr.maxImagesPerBatch) {
      return res.status(400).json({ code: -1, errorCode: 'IMAGE_BATCH_LIMIT', data: null, message: '每批最多上传' + config.ocr.maxImagesPerBatch + '张图片' });
    }
    // V3.7 起，小程序只传 fileID，避免 Base64 图片穿过 callContainer 请求限制。
    // 保留 images 兜底以兼容尚未更新的小程序包，发布新包后可移除。
    if (Array.isArray(fileIds) && fileIds.length) {
      images = await evidenceStorage.loadCaseEvidenceImages(fileIds, body.caseId);
    }
    var previous = await db.collection('evidence_batches').where({ caseId: req.body.caseId }).get();
    var knownExactHashes = [];
    var knownPerceptualHashes = [];
    (previous.data || []).forEach(function (batch) {
      knownExactHashes = knownExactHashes.concat(batch.sourceHashes || []);
      knownPerceptualHashes = knownPerceptualHashes.concat(batch.perceptualHashes || []);
    });
    knownExactHashes = knownExactHashes.concat(body.knownExactHashes || []);
    knownPerceptualHashes = knownPerceptualHashes.concat(body.knownPerceptualHashes || []);
    var detailed = await ocrService.batchOcrDetailed(images.map(function (item) { return item.base64 || ''; }), {
      knownExactHashes: knownExactHashes,
      knownPerceptualHashes: knownPerceptualHashes,
    });
    var accepted = detailed.filter(function (item) { return !item.duplicate && !item.error; });
    metrics.increment('ocr_images_completed', accepted.length);
    metrics.increment('ocr_images_duplicate', detailed.filter(function (item) { return item.duplicate; }).length);
    metrics.increment('ocr_images_failed', detailed.filter(function (item) { return !!item.error; }).length);
    var mergedText = accepted.map(function (item, index) {
      return item.text + '\n\n--- 截图 ' + (index + 1) + ' 结束 ---';
    }).join('\n\n');
    res.json({ code: 0, data: {
      text: mergedText,
      images: detailed,
      acceptedCount: accepted.length,
      duplicateCount: detailed.filter(function (item) { return item.duplicate; }).length,
      failedCount: detailed.filter(function (item) { return !!item.error; }).length,
    }, message: 'ok' });
  } catch (error) { next(error); }
});

// multer 配本地临时存储
var upload = multer({
  dest: path.join(os.tmpdir(), 'uploads-'),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

/**
 * POST /api/upload/ocr-images
 * 多图上传 + OCR（并行），返回合并文本
 * Body: multipart/form-data, fields: caseId, images[]
 */
router.post('/ocr-images', upload.array('images', 20), caseAccess.requireCaseAccess, async function (req, res, next) {
  try {
    var files = req.files || [];
    if (files.length === 0) return res.status(400).json({ code: -1, data: null, message: '未提供图片' });

    // 并行读取 base64
    var base64Promises = files.map(function (file) {
      return new Promise(function (resolve, reject) {
        fs.readFile(file.path, function (err, data) {
          if (err) { resolve(null); return; }
          try { fs.unlink(file.path, function () {}); } catch (e) {}
          resolve(data.toString('base64'));
        });
      });
    });

    var base64List = (await Promise.all(base64Promises)).filter(Boolean);

    // 并行 OCR
    var detailed = await ocrService.batchOcrDetailed(base64List);
    var texts = detailed.map(function (item) { return item.duplicate ? '' : item.text; });

    // 合并
    var mergedText = texts.map(function (t, i) {
      return (t || '[截图' + (i + 1) + ' OCR 未识别到文字]') + '\n\n--- 截图 ' + (i + 1) + ' 结束 ---\n\n';
    }).join('');

    var messages = parser.parseWeChatChatLog(mergedText);
    res.json({
      code: 0,
      data: { text: mergedText, messageCount: messages.length, imageCount: files.length, images: detailed },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/upload/video
 * 视频上传 + 云端抽帧 + OCR
 * Body: multipart/form-data, fields: caseId, video
 */
router.post('/video', upload.single('video'), caseAccess.requireCaseAccess, async function (req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ code: -1, data: null, message: '未提供视频' });

    var videoPath = req.file.path;
    var duration = parseFloat(req.body.duration || '0');

    // 如果没有提供 duration，用 ffprobe 获取
    if (!duration || duration <= 0) {
      try {
        var { execSync } = require('child_process');
        var probeOut = execSync('ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ' + videoPath.replace(/ /g, '\\ '), { encoding: 'utf8', timeout: 10000 });
        duration = parseFloat(probeOut.trim()) || 0;
      } catch (e) { /* will error below */ }
    }

    if (duration <= 0) {
      // 清理文件
      try { fs.unlink(videoPath, function () {}); } catch (e) {}
      return res.status(400).json({ code: -1, data: null, message: '无法获取视频时长' });
    }

    // 抽帧
    var { frames, count } = await videoService.extractFrames(videoPath, duration);
    // 清理视频临时文件
    try { fs.unlink(videoPath, function () {}); } catch (e) {}

    if (frames.length === 0) {
      return res.json({ code: 0, data: { text: '', messageCount: 0, framesExtracted: 0 } });
    }

    // 并行 OCR 各帧
    var frameBase64List = frames.map(function (f) { return f.base64; });
    var ocrTexts = await ocrService.batchOcr(frameBase64List);

    // 按时间组装
    var textParts = [];
    for (var i = 0; i < frames.length; i++) {
      var t = ocrTexts[i];
      if (t && t.trim()) {
        var sec = frames[i].time;
        var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        textParts.push('[视频 ' + m + ':' + (s < 10 ? '0' : '') + s + ']\n' + t.trim());
      }
    }

    var mergedText = textParts.join('\n\n');
    var messages = parser.parseWeChatChatLog(mergedText);

    res.json({
      code: 0,
      data: { text: mergedText, messageCount: messages.length, framesExtracted: count, ocrSuccess: textParts.length },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/upload/text
 * 文本直接上传
 * Body: JSON { caseId, text, note }
 */
router.post('/text', caseAccess.requireCaseAccess, async function (req, res, next) {
  try {
    var { caseId, text, note } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ code: -1, data: null, message: '文本为空' });

    var messages = parser.parseWeChatChatLog(text);
    res.json({
      code: 0,
      data: { text: text, messageCount: messages.length, note: note || '' },
    });
  } catch (err) { next(err); }
});

module.exports = router;
