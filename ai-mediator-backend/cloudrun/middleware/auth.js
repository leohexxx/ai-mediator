// ═══════════════════════════════════════════════
// 鉴权中间件 — 验证用户身份
// CloudRun 环境通过 CloudBase 的请求头获取 openid
// 本地开发模式使用 X-Openid 头模拟
// ═══════════════════════════════════════════════
var config = require('../config');

function getOpenid(req) {
  var headers = (req && req.headers) || {};
  var openid = headers['x-wx-openid'] || headers['x-cloudbase-openid'];

  // 模拟身份只能用于本地调试，生产环境不信任任意客户端提交的 openid。
  if (!openid && config.localMode) {
    openid = headers['x-mock-openid'] || (req.query && req.query._openid);
  }

  return typeof openid === 'string' && openid.trim() ? openid.trim() : null;
}

function authMiddleware(req, res, next) {
  // 生产环境仅信任 CloudBase 网关注入的身份头。
  var openid = getOpenid(req);

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

module.exports = {
  getOpenid: getOpenid,
  authMiddleware: authMiddleware,
  requireAuth: requireAuth,
};
