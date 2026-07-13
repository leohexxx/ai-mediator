// ═══════════════════════════════════════════════
// login 云函数
// 职责: 接收 wx.login code → 换取 openid → 返回自定义登录态
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 云函数入口
 * @param {Object} event - 调用参数
 * @param {string} event.code - wx.login 返回的临时 code
 * @param {Object} context - 云函数上下文
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
exports.main = async function (event, context) {
  try {
    var code = event.code;
    if (!code) {
      return { code: -1, data: null, message: '缺少登录凭证 code' };
    }

    // 调用微信接口换取 openid
    var result = await cloud.openapi.auth.code2Session({
      code: code,
    });

    if (!result || !result.openid) {
      return { code: -1, data: null, message: '获取 openid 失败，code 可能已过期' };
    }

    return {
      code: 0,
      data: {
        openid: result.openid,
        sessionKey: result.session_key,
        unionid: result.unionid || null,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('login error:', error);
    return { code: -1, data: null, message: error.message || '登录失败' };
  }
};
