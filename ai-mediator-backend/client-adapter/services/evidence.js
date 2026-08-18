// ═══════════════════════════════════════════════
// 小程序适配 — 上传服务（从云函数改为 HTTP）
// 替换原 miniprogram/services/evidence.js
// ═══════════════════════════════════════════════

var CLOUD_RUN_BASE = 'https://your-cloudrun-domain.tcloudbaseapp.com/api';

/**
 * 多图上传+OCR（HTTP multipart）
 */
function uploadImagesAndOCR(tempFilePaths, caseId, onProgress) {
  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: CLOUD_RUN_BASE + '/upload/ocr-images',
      filePath: tempFilePaths[0],
      name: 'images',
      formData: { caseId: caseId },
      success: function (res) {
        try {
          var result = JSON.parse(res.data);
          if (result.code === 0) {
            resolve({
              text: result.data.text,
              fileIds: [],
              messageCount: result.data.messageCount,
            });
          } else {
            reject(new Error(result.message || 'OCR 失败'));
          }
        } catch (e) {
          reject(new Error('解析返回失败'));
        }
      },
      fail: reject,
    });
  });
}

/**
 * 视频上传+抽帧+OCR
 */
function uploadVideo(videoPath, caseId, duration) {
  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: CLOUD_RUN_BASE + '/upload/video',
      filePath: videoPath,
      name: 'video',
      formData: { caseId: caseId, duration: String(duration || 0) },
      success: function (res) {
        try {
          var result = JSON.parse(res.data);
          if (result.code === 0) resolve(result.data);
          else reject(new Error(result.message || '视频处理失败'));
        } catch (e) { reject(new Error('解析返回失败')); }
      },
      fail: reject,
    });
  });
}

/**
 * 文本上传
 */
function uploadText(caseId, text, note) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: CLOUD_RUN_BASE + '/upload/text',
      method: 'POST',
      data: { caseId: caseId, text: text, note: note || '' },
      success: function (res) {
        if (res.data && res.data.code === 0) resolve(res.data.data);
        else reject(new Error((res.data && res.data.message) || '上传失败'));
      },
      fail: reject,
    });
  });
}

module.exports = {
  uploadImagesAndOCR: uploadImagesAndOCR,
  uploadVideo: uploadVideo,
  uploadText: uploadText,
};
