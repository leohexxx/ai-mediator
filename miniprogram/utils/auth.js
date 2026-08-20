// ═══════════════════════════════════════════════
// 小程序用户资料工具。身份由 wx.cloud / CloudBase 网关自然注入，客户端不缓存 OpenID。
// ═══════════════════════════════════════════════

/**
 * 获取用户信息（昵称、头像）。
 * 使用 wx.getUserProfile 需要用户主动触发（button open-type="getUserProfile"）
 * 或使用微信头像昵称填写能力（open-type="chooseAvatar" + type="nickname"）。
 *
 * 当前使用 wx.getUserInfo 静默获取（仅限已授权的用户）。
 * @returns {Promise<{nickname: string, avatarUrl: string}>}
 */
function getUserProfile() {
  return new Promise(function (resolve, reject) {
    wx.getUserInfo({
      success: function (res) {
        resolve({
          nickname: res.userInfo.nickName || '微信用户',
          avatarUrl: res.userInfo.avatarUrl || '',
        });
      },
      fail: function (err) {
        // 降级：返回默认值
        console.warn('获取用户信息失败，使用默认值:', err);
        resolve({
          nickname: '微信用户',
          avatarUrl: '',
        });
      },
    });
  });
}

module.exports = {
  getUserProfile: getUserProfile,
};
