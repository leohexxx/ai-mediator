// ═══════════════════════════════════════════════
// AI 调解员 — 小程序入口
// ═══════════════════════════════════════════════

App({
  /**
   * 小程序启动时触发（全局只触发一次）
   */
  onLaunch: function (options) {
    var that = this;

    // 初始化云开发
    wx.cloud.init({
      env: 'your-env-id',  // TODO: 替换为实际的云开发环境 ID
      traceUser: true,
    });

    // 静默登录
    this.doLogin().then(function (openid) {
      that.globalData.openid = openid;
      console.log('登录成功, openid:', openid);
    }).catch(function (err) {
      console.error('登录失败:', err);
    });

    // 解析启动参数中的邀请码
    if (options && options.query && options.query.inviteCode) {
      that.globalData.pendingInviteCode = options.query.inviteCode;
    }
  },

  /**
   * 小程序显示/切前台时触发
   */
  onShow: function (options) {
    // 解析场景参数中的邀请码（扫码进入）
    if (options && options.query && options.query.inviteCode) {
      this.globalData.pendingInviteCode = options.query.inviteCode;
    }
  },

  /**
   * 小程序隐藏/切后台时触发
   */
  onHide: function () {
    // 暂不处理
  },

  /**
   * 静默登录：调用 login 云函数获取 openid
   * @returns {Promise<string>}
   */
  doLogin: function () {
    var that = this;
    return new Promise(function (resolve, reject) {
      // 先从本地缓存读取
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
   * 全局数据
   */
  globalData: {
    /** @type {string|null} 当前用户 openid */
    openid: null,
    /** @type {string|null} 待处理的邀请码 */
    pendingInviteCode: null,
    /** @type {string} 云开发环境 ID */
    envId: 'your-env-id',
  },
});
