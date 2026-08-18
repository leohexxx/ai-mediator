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

router.use(auth.requireAuth);

router.post('/ocr-batch', caseAccess.requireCaseAccess, async function (req, res, next) {
  try {
    var images = (req.body && req.body.images) || [];
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ code: -1, errorCode: 'IMAGES_REQUIRED', data: null, message: '未提供图片' });
    }
    if (images.length > config.ocr.maxImagesPerBatch) {
      return res.status(400).json({ code: -1, errorCode: 'IMAGE_BATCH_LIMIT', data: null, message: '每批最多上传' + config.ocr.maxImagesPerBatch + '张图片' });
    }
    var previous = await db.collection('evidence_batches').where({ caseId: req.body.caseId }).get();
    var knownExactHashes = [];
    var knownPerceptualHashes = [];
    (previous.data || []).forEach(function (batch) {
      knownExactHashes = knownExactHashes.concat(batch.sourceHashes || []);
      knownPerceptualHashes = knownPerceptualHashes.concat(batch.perceptualHashes || []);
    });
    knownExactHashes = knownExactHashes.concat(req.body.knownExactHashes || []);
    knownPerceptualHashes = knownPerceptualHashes.concat(req.body.knownPerceptualHashes || []);
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
