// ═══════════════════════════════════════════════
// invite-panel 组件 — 邀请面板
// ═══════════════════════════════════════════════

var caseService = require('../../services/case');

Component({
  properties: {
    /** 邀请信息 */
    invitation: {
      type: Object,
      value: null,
    },
    /** 案例标题 */
    caseTitle: {
      type: String,
      value: '',
    },
  },

  data: {
    /** 邀请码 */
    inviteCode: '',
    /** 小程序码文件 ID */
    qrcodeFileID: '',
    /** 是否生成中 */
    generating: false,
  },

  observers: {
    'invitation': function (invitation) {
      if (invitation) {
        this.setData({
          inviteCode: invitation.inviteCode || '',
          qrcodeFileID: invitation.qrcodeFileID || '',
        });
      }
    },
  },

  methods: {
    /**
     * 生成小程序码
     */
    onGenerateQRCode: function () {
      var that = this;
      // 获取 caseId 需要从页面传入，这里通过 properties 没有直接拿到
      // 可以通过 triggerEvent 通知父页面处理
      this.triggerEvent('generateqrcode');
    },

    /**
     * 复制邀请码
     */
    onCopyCode: function () {
      var code = this.data.inviteCode;
      if (!code) return;
      wx.setClipboardData({
        data: code,
        success: function () {
          wx.showToast({ title: '邀请码已复制', icon: 'success' });
        },
      });
    },

    /**
     * 分享
     */
    onShare: function () {
      this.triggerEvent('share');
    },

    /**
     * 收起面板
     */
    onToggle: function () {
      this.triggerEvent('toggle');
    },
  },
});
