// ═══════════════════════════════════════════════
// 证据服务层 - uploadEvidence
// ═══════════════════════════════════════════════

var cloudUtil = require('../utils/cloud');

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
  return cloudUtil.callFunction('uploadEvidence', {
    caseId: params.caseId,
    rawText: params.rawText,
    note: params.note || '',
    fileIds: params.fileIds || [],
    supplement: params.supplement === true,
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
 * OCR 识别本地图片（前端转 base64 后传给云函数）
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<{code: number, data: {text: string}|null, message: string}>}
 */
function ocrImage(filePath) {
  return new Promise(function (resolve, reject) {
    var fs = wx.getFileSystemManager();
    var ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
    var mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    fs.readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (readRes) {
        cloudUtil.callFunction('ocrImage', {
          base64: readRes.data,
          mimeType: mimeType,
        }).then(resolve).catch(reject);
      },
      fail: function (err) {
        reject(new Error('读取图片失败: ' + (err.errMsg || err.message)));
      },
    });
  });
}

/**
 * OCR 识别 base64 图片（直接传 base64，不读文件。用于视频帧等场景）
 * @param {string} base64 - 图片 base64 编码（不含 data:image 前缀）
 * @returns {Promise<{code: number, data: {text: string}|null, message: string}>}
 */
function ocrImageBase64(base64) {
  return cloudUtil.callFunction('ocrImage', {
    base64: base64,
    mimeType: 'image/jpeg',
  });
}

/**
 * 批量上传图片并做 OCR 识别
 * @param {string[]} tempFilePaths - 本地文件路径列表
 * @param {string} caseId - 案例 ID
 * @param {function(number, number): void} [onProgress] - 进度回调 (current, total)
 * @returns {Promise<{text: string, fileIds: string[]}>}
 */
function uploadImagesAndOCR(tempFilePaths, caseId, onProgress) {
  var totalCount = tempFilePaths.length;
  var textResults = [];
  var fileIds = [];

  function uploadOne(index) {
    if (index >= totalCount) {
      return {
        text: textResults.join('\n\n--- 截图 ' + (index) + ' 结束 ---\n\n'),
        fileIds: fileIds,
      };
    }

    if (onProgress) onProgress(index + 1, totalCount);

    var filePath = tempFilePaths[index];

    // 先 OCR（用本地路径），同时上传云存储保存证据
    var ocrPromise = ocrImage(filePath);
    var uploadPromise = uploadImageToCloud(filePath, caseId);

    return Promise.all([ocrPromise.catch(function (e) {
      return { code: -1, data: null, message: e.message || 'OCR 失败' };
    }), uploadPromise]).then(function (results) {
      var ocrResult = results[0];
      var fileID = results[1];

      if (fileID) fileIds.push(fileID);

      if (ocrResult.code === 0 && ocrResult.data && ocrResult.data.text) {
        textResults.push(ocrResult.data.text);
      } else {
        textResults.push('[截图' + (index + 1) + ' OCR 未识别到文字: ' + (ocrResult.message || '') + ']');
      }
      return uploadOne(index + 1);
    });
  }

  return uploadOne(0);
}

/**
 * 批量 OCR 识别（视频帧专用）— 所有帧合并为一次云函数调用
 * @param {Array<{base64: string, timeIndex: number}>} frames - 帧列表
 * @returns {Promise<{code: number, data: {combinedText: string, results: Array}|null, message: string}>}
 */
function ocrBatch(frames) {
  return cloudUtil.callFunction('ocrBatch', {
    frames: frames,
    mimeType: 'image/jpeg',
  });
}

module.exports = {
  uploadEvidence: uploadEvidence,
  chooseMessageFile: chooseMessageFile,
  chooseMedia: chooseMedia,
  getClipboardText: getClipboardText,
  uploadImageToCloud: uploadImageToCloud,
  uploadVideoToCloud: uploadVideoToCloud,
  ocrImage: ocrImage,
  ocrImageBase64: ocrImageBase64,
  ocrBatch: ocrBatch,
  uploadImagesAndOCR: uploadImagesAndOCR,
};
