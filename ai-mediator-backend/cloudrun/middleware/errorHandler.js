// ═══════════════════════════════════════════════
// 错误处理中间件
// ═══════════════════════════════════════════════
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message || err);
  var status = err.status || 500;
  res.status(status).json({
    code: -1,
    data: null,
    message: err.message || '服务器内部错误',
  });
}

module.exports = errorHandler;
