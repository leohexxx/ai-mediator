// CloudRun OCR 只读取当前案件目录内、由小程序先上传到云存储的图片。
var db = require('./db');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCaseEvidenceFileId(fileId, caseId) {
  if (typeof fileId !== 'string' || !caseId) return false;
  var expectedPath = new RegExp('^cloud://[^/]+/evidence/' + escapeRegExp(caseId) + '/[^/]+$');
  return expectedPath.test(fileId);
}

function requestError(status, code, message) {
  var error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function loadCaseEvidenceImages(fileIds, caseId, downloadFile) {
  if (!Array.isArray(fileIds) || !fileIds.length) {
    throw requestError(400, 'FILE_IDS_REQUIRED', '请先上传图片后再识别');
  }
  var downloader = downloadFile || db.downloadFile;
  return Promise.all(fileIds.map(async function (fileId, index) {
    if (!isCaseEvidenceFileId(fileId, caseId)) {
      throw requestError(400, 'INVALID_EVIDENCE_FILE', '图片不属于当前案例，无法识别');
    }
    try {
      var fileContent = await downloader(fileId);
      if (!fileContent || !fileContent.length) throw new Error('文件内容为空');
      return { base64: Buffer.from(fileContent).toString('base64'), index: index };
    } catch (error) {
      throw requestError(502, 'EVIDENCE_DOWNLOAD_FAILED', '读取已上传图片失败：' + (error.message || '请重新上传'));
    }
  }));
}

module.exports = {
  isCaseEvidenceFileId: isCaseEvidenceFileId,
  loadCaseEvidenceImages: loadCaseEvidenceImages,
};
