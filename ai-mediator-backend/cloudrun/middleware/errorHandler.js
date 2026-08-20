// ═══════════════════════════════════════════════
// 错误处理中间件
// ═══════════════════════════════════════════════
function isMissingCollectionError(error) {
  var message = String(error && (error.message || error.errMsg || error) || '');
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1 ||
    message.indexOf('Db or Table not exist') !== -1 ||
    message.indexOf('ResourceNotFound') !== -1;
}

function normalizeError(err) {
  var rawMessage = String(err && (err.message || err.errMsg || err) || '');
  var isMissingCollection = isMissingCollectionError(err);
  var isOcrCollection = rawMessage.indexOf('ocr_jobs') !== -1;
  var status = err.status || (isMissingCollection ? 503 : 500);
  var errorCode = err.code || 'INTERNAL_ERROR';
  var message = err.message || '服务器内部错误';

  if (isOcrCollection) {
    errorCode = 'OCR_COLLECTION_NOT_READY';
    message = '图片识别服务尚未完成初始化，请稍后重试或联系管理员处理';
  } else if (isMissingCollection) {
    errorCode = 'DATABASE_COLLECTION_NOT_READY';
    message = '服务数据尚未完成初始化，请联系管理员处理';
  }

  return { rawMessage: rawMessage, status: status, errorCode: errorCode, message: message };
}

function errorHandler(err, req, res, next) {
  var normalized = normalizeError(err);
  console.error(JSON.stringify({
    event: 'api_error',
    path: req && req.path,
    errorCode: normalized.errorCode,
    status: normalized.status,
    message: normalized.rawMessage,
  }));
  res.status(normalized.status).json({
    code: -1,
    errorCode: normalized.errorCode,
    data: null,
    message: normalized.message,
  });
}

module.exports = errorHandler;
module.exports.isMissingCollectionError = isMissingCollectionError;
module.exports.normalizeError = normalizeError;

module.exports = errorHandler;
