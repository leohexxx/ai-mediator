// ═══════════════════════════════════════════════
// 啷个对 — 小程序入口 (v4 - 云开发修复)
// ═══════════════════════════════════════════════

App({
  onLaunch: function (options) {
    var that = this;

    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloudbase-d4g5p82875fe1a5ce',
        traceUser: true,
      });
    } else {
      console.error('当前基础库不支持云开发，请升级微信或基础库版本');
    }

    // 监听微信原生隐私授权事件（合规必须）
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization(function (resolve) {
        that._privacyResolve = resolve;
        that._pendingPrivacyAuth = true;
      });
    }

    // 静默登录（非阻塞，失败不影响 app 启动）
    this.doLogin().then(function (openid) {
      that.globalData.openid = openid;
      console.log('登录成功, openid:', openid);
    }).catch(function (err) {
      console.warn('登录失败（不影响使用，后续操作会自动重试）:', err);
    });

    // 解析分享进入的案例 ID
    if (options && options.query) {
      if (options.query.caseId) {
        that.globalData.pendingCaseId = options.query.caseId;
      }
      if (options.query.scene) {
        var scene = decodeURIComponent(options.query.scene || '');
        if (scene.indexOf('share_') === 0) {
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

  /**
   * 登录流程 (v2)
   * 不再需要 wx.login + code2Session
   * 直接调用 login 云函数，通过 getWXContext 获取 openid
   */
  doLogin: function () {
    var that = this;
    return new Promise(function (resolve, reject) {
      // 优先使用缓存
      var cachedOpenid = wx.getStorageSync('openid');
      if (cachedOpenid) {
        that.globalData.openid = cachedOpenid;
        resolve(cachedOpenid);
        return;
      }

      // 检查云开发是否可用
      if (!wx.cloud) {
        reject(new Error('云开发不可用'));
        return;
      }

      // 直接调用 login 云函数（不需要 wx.login code）
      wx.cloud.callFunction({
        name: 'login',
        data: {},
        success: function (cfRes) {
          var result = cfRes.result;
          if (result && result.code === 0 && result.data && result.data.openid) {
            var openid = result.data.openid;
            wx.setStorageSync('openid', openid);
            that.globalData.openid = openid;
            resolve(openid);
          } else {
            reject(new Error(result && result.message || '登录失败'));
          }
        },
        fail: function (err) {
          reject(err);
        },
      });
    });
  },

  /**
   * 确保已登录（其他页面调用此方法，确保 openid 可用）
   * 如果未登录则自动重试
   */
  ensureLogin: function () {
    var that = this;
    if (this.globalData.openid) {
      return Promise.resolve(this.globalData.openid);
    }
    return this.doLogin().catch(function (err) {
      console.warn('ensureLogin 重试失败:', err);
      return Promise.reject(err);
    });
  },

  /**
   * 检查用户是否已同意隐私政策和用户协议
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
