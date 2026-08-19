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
function uploadImagesAndOCR(tempFilePaths, caseId, onProgress, knownHashes) {
  var totalCount = tempFilePaths.length;
  var uploadTasks = tempFilePaths.map(function (filePath) {
    return uploadImageToCloud(filePath, caseId);
  });
  return Promise.all(uploadTasks).then(function (fileIds) {
    // callContainer 对单次同步调用有较短等待窗口。长截图的高精度 OCR 会分块，
    // 因此逐张调用，避免一批 9 张图片在网关超时前还没处理完。
    var state = {
      images: [], blocks: [], hashes: [], perceptualHashes: [], acceptedFileIds: [],
      textParts: [], acceptedCount: 0, duplicateCount: 0,
    };
    var exactHashes = (knownHashes && knownHashes.exact || []).slice();
    var perceptualHashes = (knownHashes && knownHashes.perceptual || []).slice();
    var sequence = Promise.resolve();
    fileIds.forEach(function (fileId, index) {
      sequence = sequence.then(function () {
        return cloudRun.call('/api/upload/ocr-batch', 'POST', {
          caseId: caseId,
          fileIds: [fileId],
          knownExactHashes: exactHashes,
          knownPerceptualHashes: perceptualHashes,
        }).then(function (result) {
          var data = result.data || {};
          var image = (data.images || [])[0] || { index: 0, error: '识别服务未返回结果' };
          image.index = index;
          state.images.push(image);
          if (image.duplicate) {
            state.duplicateCount++;
          } else if (!image.error) {
            state.acceptedCount++;
            state.acceptedFileIds.push(fileId);
            state.hashes.push(image.exactHash);
            state.perceptualHashes.push(image.perceptualHash);
            exactHashes.push(image.exactHash);
            perceptualHashes.push(image.perceptualHash);
            state.blocks = state.blocks.concat(image.blocks || []);
            state.textParts.push((image.text || '') + '\n\n--- 截图 ' + (index + 1) + ' 结束 ---');
          }
          if (onProgress) onProgress(index + 1, totalCount);
        });
      });
    });
    return sequence.then(function () {
      return {
        text: state.textParts.join('\n\n'), fileIds: state.acceptedFileIds, images: state.images,
        ocrBlocks: state.blocks, sourceHashes: state.hashes, perceptualHashes: state.perceptualHashes,
        acceptedCount: state.acceptedCount, duplicateCount: state.duplicateCount,
      };
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
};
