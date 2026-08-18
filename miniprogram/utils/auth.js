// ═══════════════════════════════════════════════
// 登录态管理工具
// ═══════════════════════════════════════════════

/**
 * 获取当前用户的 openid。
 * 优先从 app.globalData 读取，其次从本地缓存读取，
 * 都没有则触发登录流程。
 *
 * @returns {Promise<string>}
 */
function getOpenid() {
  return new Promise(function (resolve, reject) {
    var app = getApp();

    // 先从 globalData 读取
    if (app.globalData && app.globalData.openid) {
      resolve(app.globalData.openid);
      return;
    }

    // 再从本地缓存读取
    var cachedOpenid = wx.getStorageSync('openid');
    if (cachedOpenid) {
      app.globalData.openid = cachedOpenid;
      resolve(cachedOpenid);
      return;
    }

    // 触发登录
    app.doLogin()
      .then(function (openid) {
        resolve(openid);
      })
      .catch(function (err) {
        reject(err);
      });
  });
}

/**
 * 设置 openid（写入缓存和 globalData）
 * @param {string} openid
 */
function setOpenid(openid) {
  wx.setStorageSync('openid', openid);
  var app = getApp();
  if (app && app.globalData) {
    app.globalData.openid = openid;
  }
}

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
  getOpenid: getOpenid,
  setOpenid: setOpenid,
  getUserProfile: getUserProfile,
};
