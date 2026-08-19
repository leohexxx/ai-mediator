// ═══════════════════════════════════════════════
// 证据服务层 - uploadEvidence
// ═══════════════════════════════════════════════

var cloudUtil = require('../utils/cloud');
var cloudRun = require('../utils/cloudrun');

/**
 * 上传聊天证据
 * @param {Object} params
 * @param {string} params.caseId - 案例 ID
 * @param {string} params.rawText - 聊天记录文本
 * @param {string} [params.note] - 备注
 * @param {string[]} [params.fileIds] - 云存储文件 ID
 * @param {boolean} [params.supplement] - 是否为补充证据（跳过状态检查）
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function uploadEvidence(params) {
  return cloudRun.call('/api/evidence/batches', 'POST', {
    caseId: params.caseId,
    rawText: params.rawText,
    note: params.note || '',
    fileIds: params.fileIds || [],
    sourceHashes: params.sourceHashes || [],
    perceptualHashes: params.perceptualHashes || [],
    ocrBlocks: params.ocrBlocks || [],
    idempotencyKey: params.idempotencyKey || cloudRun.idempotencyKey('evidence_' + params.caseId),
  });
}

/**
 * 选择聊天记录文件（从微信聊天导出）
 * @returns {Promise<{content: string, fileName: string}>}
 */
function chooseMessageFile() {
  return new Promise(function (resolve, reject) {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: function (res) {
        if (!res.tempFiles || res.tempFiles.length === 0) {
          reject(new Error('未选择文件'));
          return;
        }
        var file = res.tempFiles[0];
        // 尝试多种编码读取（优先 utf8，失败则尝试 gbk）
        var fs = wx.getFileSystemManager();
        try {
          var content = fs.readFileSync(file.path, 'utf8');
          if (!content || !content.trim()) {
            reject(new Error('文件内容为空，请确认导出了正确的聊天记录'));
            return;
          }
          resolve({ content: content, fileName: file.name || 'chat.txt' });
        } catch (err) {
          reject(new Error('读取文件失败: ' + err.message + '。请确认是 .txt 格式的聊天记录'));
        }
      },
      fail: function (err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          reject(new Error('cancel'));
        } else {
          console.error('wx.chooseMessageFile failed:', err);
          wx.showModal({
            title: '选择文件失败',
            content: '请确保已从微信导出聊天记录文件（.txt）。\n\n操作路径：我→设置→通用→聊天记录迁移与备份→导出聊天记录',
            showCancel: false,
          });
          reject(err);
        }
      },
    });
  });
}

/**
 * 从相册选择截图
 * @param {number} [count=9] - 最多选择数量
 * @returns {Promise<{tempFilePaths: string[], tempFiles: Object[]}>}
 */
function chooseMedia(count) {
  count = count || 9;
  return new Promise(function (resolve, reject) {
    wx.chooseMedia({
      count: count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        resolve({
          tempFilePaths: res.tempFiles.map(function (f) { return f.tempFilePath; }),
          tempFiles: res.tempFiles,
        });
      },
      fail: function (err) {
        reject(err);
      },
    });
  });
}

/**
 * 从剪贴板获取粘贴的文本
 * @returns {Promise<string>}
 */
function getClipboardText() {
  return new Promise(function (resolve, reject) {
    wx.getClipboardData({
      success: function (res) {
        resolve(res.data || '');
      },
      fail: function (err) {
        reject(err);
      },
    });
  });
}

/**
 * 上传图片到云存储
 * @param {string} filePath - 本地文件路径
 * @param {string} caseId - 案例 ID
 * @returns {Promise<string>} fileID
 */
function uploadImageToCloud(filePath, caseId) {
  var timestamp = Date.now();
  var random = Math.random().toString(36).substring(2, 8);
  var cloudPath = 'evidence/' + caseId + '/' + timestamp + '_' + random + '.png';
  return cloudUtil.uploadFile(cloudPath, filePath).then(function (res) {
    return res.fileID;
  });
}

/**
 * 上传视频/录屏到云存储
 * @param {string} filePath - 本地视频路径
 * @param {string} caseId - 案例 ID
 * @returns {Promise<string>} fileID
 */
function uploadVideoToCloud(filePath, caseId) {
  var timestamp = Date.now();
  var random = Math.random().toString(36).substring(2, 8);
  var cloudPath = 'evidence/' + caseId + '/' + timestamp + '_' + random + '.mp4';
  return cloudUtil.uploadFile(cloudPath, filePath).then(function (res) {
    return res.fileID;
  });
}

/**
 * 批量上传图片并做 OCR 识别
 * @param {string[]} tempFilePaths - 本地文件路径列表
 * @param {string} caseId - 案例 ID
 * @param {function(number, number): void} [onProgress] - 进度回调 (current, total)
 * @returns {Promise<{text: string, fileIds: string[]}>}
 */
function mapOcrJobResult(data, fileIds) {
  var images = data.images || [];
  var blocks = [];
  var hashes = [];
  var perceptualHashes = [];
  var acceptedFileIds = [];
  images.forEach(function (image) {
    if (!image.duplicate && !image.error) {
      hashes.push(image.exactHash);
      perceptualHashes.push(image.perceptualHash);
      if (fileIds[image.index]) acceptedFileIds.push(fileIds[image.index]);
      blocks = blocks.concat(image.blocks || []);
    }
  });
  return {
    text: data.text || '', fileIds: acceptedFileIds, images: images,
    ocrBlocks: blocks, sourceHashes: hashes, perceptualHashes: perceptualHashes,
    acceptedCount: data.acceptedCount || 0, duplicateCount: data.duplicateCount || 0,
  };
}

function startOcrJob(fileIds, caseId, knownHashes) {
  return cloudRun.call('/api/upload/ocr-jobs', 'POST', {
    caseId: caseId,
    fileIds: fileIds,
    knownExactHashes: knownHashes && knownHashes.exact || [],
    knownPerceptualHashes: knownHashes && knownHashes.perceptual || [],
    idempotencyKey: cloudRun.idempotencyKey('ocr_' + caseId),
  }).then(function (result) { return result.data; });
}

function getOcrJob(jobId) {
  return cloudRun.call('/api/upload/ocr-jobs/' + jobId, 'GET').then(function (result) {
    return result.data || {};
  });
}

function waitForOcrJob(jobId, fileIds, onProgress) {
  var transientFailures = 0;
  return new Promise(function (resolve, reject) {
    function poll() {
      getOcrJob(jobId).then(function (job) {
        transientFailures = 0;
        var progress = job.progress || {};
        if (onProgress) onProgress(progress.current || 0, progress.total || fileIds.length);
        if (job.status === 'completed') {
          resolve(mapOcrJobResult(job.result || {}, fileIds));
          return;
        }
        if (job.status === 'failed') {
          var error = new Error(job.errorMessage || '图片识别失败，请重新提交该批图片');
          error.errorCode = job.errorCode || 'OCR_JOB_FAILED';
          reject(error);
          return;
        }
        setTimeout(poll, 2000);
      }).catch(function (error) {
        transientFailures++;
        if (transientFailures >= 5) {
          reject(error);
          return;
        }
        setTimeout(poll, Math.min(5000, 1000 * transientFailures));
      });
    }
    poll();
  });
}

function resumeImagesAndOCR(jobId, fileIds, onProgress) {
  return waitForOcrJob(jobId, fileIds || [], onProgress);
}

function uploadImagesAndOCR(tempFilePaths, caseId, onProgress, knownHashes, onJobCreated) {
  var uploadTasks = tempFilePaths.map(function (filePath) {
    return uploadImageToCloud(filePath, caseId);
  });
  return Promise.all(uploadTasks).then(function (fileIds) {
    return startOcrJob(fileIds, caseId, knownHashes).then(function (job) {
      if (onJobCreated) onJobCreated(job.jobId, fileIds);
      return waitForOcrJob(job.jobId, fileIds, onProgress);
    });
  });
}

/**
 * 批量 OCR 识别（视频帧专用）— 所有帧合并为一次云函数调用
 * @param {Array<{base64: string, timeIndex: number}>} frames - 帧列表
 * @returns {Promise<{code: number, data: {combinedText: string, results: Array}|null, message: string}>}
 */
function ocrBatch(frames, caseId) {
  return cloudRun.call('/api/upload/ocr-batch', 'POST', {
    caseId: caseId,
    images: frames.map(function (frame, index) {
      return { base64: frame.base64, index: index, timeIndex: frame.timeIndex };
    }),
  }).then(function (result) {
    var data = result.data || {};
    return {
      code: 0,
      data: {
        successCount: data.acceptedCount || 0,
        totalFrames: frames.length,
        combinedText: data.text || '',
        images: data.images || [],
      },
      message: result.message || 'ok',
    };
  });
}

module.exports = {
  uploadEvidence: uploadEvidence,
  chooseMessageFile: chooseMessageFile,
  chooseMedia: chooseMedia,
  getClipboardText: getClipboardText,
  uploadImageToCloud: uploadImageToCloud,
  uploadVideoToCloud: uploadVideoToCloud,
  ocrBatch: ocrBatch,
  uploadImagesAndOCR: uploadImagesAndOCR,
  startOcrJob: startOcrJob,
  getOcrJob: getOcrJob,
  resumeImagesAndOCR: resumeImagesAndOCR,
};
