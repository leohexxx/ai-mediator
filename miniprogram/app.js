// ═══════════════════════════════════════════════
// 啷个对 — 小程序入口 (v3 - 合规改造)
// ═══════════════════════════════════════════════

App({
  onLaunch: function (options) {
    var that = this;

    // 初始化云开发
    wx.cloud.init({
      env: 'cloudbase-d4g5p82875fe1a5ce',
      traceUser: true,
    });

    // 静默登录
    this.doLogin().then(function (openid) {
      that.globalData.openid = openid;
      console.log('登录成功, openid:', openid);
    }).catch(function (err) {
      console.error('登录失败:', err);
    });

    // 解析分享进入的案例 ID
    if (options && options.query) {
      if (options.query.caseId) {
        that.globalData.pendingCaseId = options.query.caseId;
      }
      if (options.query.scene) {
        var scene = decodeURIComponent(options.query.scene || '');
        if (scene.startsWith('share_')) {
          that.globalData.pendingCaseId = scene.replace('share_', '');
        }
      }
    }
  },

  onShow: function (options) {
    if (options && options.query) {
      if (options.query.caseId) {
        this.globalData.pendingCaseId = options.query.caseId;
      }
    }
  },

  onHide: function () {},

  doLogin: function () {
    var that = this;
    return new Promise(function (resolve, reject) {
      var cachedOpenid = wx.getStorageSync('openid');
      if (cachedOpenid) {
        that.globalData.openid = cachedOpenid;
        resolve(cachedOpenid);
        return;
      }

      wx.login({
        success: function (res) {
          if (res.code) {
            wx.cloud.callFunction({
              name: 'login',
              data: { code: res.code },
              success: function (cfRes) {
                var result = cfRes.result;
                if (result && result.code === 0 && result.data) {
                  var openid = result.data.openid;
                  wx.setStorageSync('openid', openid);
                  that.globalData.openid = openid;
                  resolve(openid);
                } else {
                  reject(new Error(result.message || '登录失败'));
                }
              },
              fail: function (err) {
                reject(err);
              },
            });
          } else {
            reject(new Error('wx.login 失败'));
          }
        },
        fail: function (err) {
          reject(err);
        },
      });
    });
  },

  /**
   * 检查用户是否已同意隐私政策和用户协议
   * @returns {boolean}
   */
  hasAgreedPrivacy: function () {
    try {
      return wx.getStorageSync('privacy_agreed') === true;
    } catch (_) {
      return false;
    }
  },

  /**
   * 记录用户同意
   */
  agreePrivacy: function () {
    try {
      wx.setStorageSync('privacy_agreed', true);
      wx.setStorageSync('privacy_agreed_at', new Date().toISOString());
    } catch (_) {}
  },

  globalData: {
    openid: null,
    pendingCaseId: null,
    envId: 'cloudbase-d4g5p82875fe1a5ce',
  },
});
