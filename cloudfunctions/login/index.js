// ═══════════════════════════════════════════════
// login 云函数 (v2)
// 职责: 通过 getWXContext 获取用户 openid，返回登录态
// 改进: 不再需要 wx.login + code2Session，直接从云函数上下文获取
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async function (event, context) {
  try {
    // getWXContext 直接获取调用者的身份信息
    // 不需要前端传 code，云函数上下文自带 openid
    var wxContext = cloud.getWXContext();
    var openid = wxContext.OPENID;
    var unionid = wxContext.UNIONID || null;

    if (!openid) {
      return { code: -1, data: null, message: '无法获取用户身份' };
    }

    return {
      code: 0,
      data: {
        openid: openid,
        unionid: unionid,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('login error:', error);
    return { code: -1, data: null, message: error.message || '登录失败' };
  }
};
