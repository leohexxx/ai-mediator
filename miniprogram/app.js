// ═══════════════════════════════════════════════
// 啷个对 — 小程序入口 (V3 - CloudBase 自然身份)
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
    pendingCaseId: null,
    envId: 'cloudbase-d4g5p82875fe1a5ce',
  },
});
