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
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function uploadEvidence(params) {
  return cloudUtil.callFunction('uploadEvidence', {
    caseId: params.caseId,
    rawText: params.rawText,
    note: params.note || '',
    fileIds: params.fileIds || [],
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
      extension: ['txt'],
      success: function (res) {
        var file = res.tempFiles[0];
        // 读取文件内容
        var fs = wx.getFileSystemManager();
        try {
          var content = fs.readFileSync(file.path, 'utf8');
          resolve({ content: content, fileName: file.name });
        } catch (err) {
          reject(new Error('读取文件失败: ' + err.message));
        }
      },
      fail: function (err) {
        reject(err);
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

module.exports = {
  uploadEvidence: uploadEvidence,
  chooseMessageFile: chooseMessageFile,
  chooseMedia: chooseMedia,
  getClipboardText: getClipboardText,
  uploadImageToCloud: uploadImageToCloud,
};
