// ═══════════════════════════════════════════════
// 鉴权中间件 — 验证用户身份
// CloudRun 环境通过 CloudBase 的请求头获取 openid
// 本地开发模式使用 X-Openid 头模拟
// ═══════════════════════════════════════════════
var config = require('../config');

function authMiddleware(req, res, next) {
  // CloudRun 生产环境: openid 从请求头自动注入
  // CloudBase 网关会自动附加 X-Wx-Openid 头
  var openid = req.headers['x-wx-openid'] ||
               req.headers['x-cloudbase-openid'] ||
               req.headers['x-openid'];

  // 本地调试: 允许通过请求头或参数模拟
  if (!openid && config.localMode) {
    openid = req.headers['x-mock-openid'] || req.query._openid;
  }

  if (!openid) {
    // 不强制要求 openid（公开接口除外），交由路由自行处理
    req.openid = null;
  } else {
    req.openid = openid;
  }

  next();
}

// 需要登录的路由使用此中间件
function requireAuth(req, res, next) {
  if (!req.openid) {
    return res.status(401).json({
      code: -1, data: null, message: '未登录，请通过微信客户端访问',
    });
  }
  next();
}

module.exports = { authMiddleware: authMiddleware, requireAuth: requireAuth };
