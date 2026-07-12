// ═══════════════════════════════════════════════
// 案例详情页 — 双人状态面板 + 操作区 + 邀请面板
// ═══════════════════════════════════════════════

var caseService = require('../../services/case');
var formatUtil = require('../../utils/format');
var watchUtil = require('../../utils/watch');

Page({
  data: {
    /** 案例 ID */
    caseId: '',
    /** 案例数据 */
    caseData: null,
    /** 当前用户角色 */
    role: '',
    /** 己方证据 */
    myEvidence: null,
    /** 对方证据 */
    otherEvidence: null,
    /** 分析报告 */
    analysis: null,
    /** 邀请信息 */
    invitation: null,
    /** 是否正在加载 */
    loading: true,
    /** 是否显示邀请面板 */
    showInvitePanel: false,
    /** 状态文案 */
    statusLabel: '',
    /** 对方状态文案 */
    otherPartyLabel: '',
  },

  onLoad: function (options) {
    var caseId = options.caseId;
    this.setData({ caseId: caseId });

    if (options.action === 'share') {
      this.setData({ showInvitePanel: true });
    }

    this.loadDetail();
    this.startWatch();
  },

  onUnload: function () {
    // 停止监听
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  },

  /**
   * 分享配置
   */
  onShareAppMessage: function () {
    var inviteCode = this.data.invitation
      ? this.data.invitation.inviteCode
      : '';
    return {
      title: this.data.caseData
        ? '「' + this.data.caseData.title + '」邀请你加入 AI 调解'
        : '邀请你加入 AI 调解',
      path: '/pages/case-detail/case-detail?caseId=' + this.data.caseId + '&inviteCode=' + inviteCode,
      imageUrl: '',
    };
  },

  /**
   * 加载案例详情
   */
  loadDetail: function () {
    var that = this;
    this.setData({ loading: true });

    caseService.getCaseDetail(this.data.caseId).then(function (res) {
      if (res.code === 0 && res.data) {
        var caseData = res.data.caseData;
        that.setData({
          caseData: caseData,
          role: res.data.role,
          myEvidence: res.data.myEvidence,
          otherEvidence: res.data.otherEvidence,
          analysis: res.data.analysis,
          invitation: res.data.invitation,
          loading: false,
          statusLabel: formatUtil.statusLabel(caseData.status),
          otherPartyLabel: that.getOtherPartyLabel(caseData, res.data.role),
          showInvitePanel: that.data.showInvitePanel || (res.data.role === 'party_a' && caseData.status === 'waiting_party_b'),
        });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        that.setData({ loading: false });
      }
    }).catch(function (err) {
      console.error('加载案例详情失败:', err);
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  /**
   * 启动实时监听
   */
  startWatch: function () {
    var that = this;
    this._watcher = watchUtil.watchDocument('cases', this.data.caseId, function (doc) {
      if (doc) {
        var oldStatus = that.data.caseData ? that.data.caseData.status : '';
        that.setData({
          caseData: doc,
          statusLabel: formatUtil.statusLabel(doc.status),
          otherPartyLabel: that.getOtherPartyLabel(doc, that.data.role),
        });

        // 状态变更提示
        if (doc.status !== oldStatus) {
          if (doc.status === 'completed') {
            wx.showToast({ title: '分析完成！', icon: 'success' });
            that.loadDetail(); // 重新加载以获取分析结果
          } else if (doc.status === 'analyzing' && oldStatus === 'waiting_submission') {
            wx.showToast({ title: '双方已提交，开始分析', icon: 'none' });
          }
        }

        // 对方加入/提交提示
        if (that.data.role === 'party_a') {
          var oldPartyBOpenid = that.data.caseData ? that.data.caseData.party_b.openid : null;
          if (!oldPartyBOpenid && doc.party_b.openid) {
            wx.showToast({ title: '乙方已加入！', icon: 'success' });
            that.setData({ showInvitePanel: false });
          }
          var oldPartyBSubmitted = that.data.caseData ? that.data.caseData.party_b.submitted : false;
          if (!oldPartyBSubmitted && doc.party_b.submitted) {
            wx.showToast({ title: '乙方已提交证据', icon: 'none' });
          }
        }
      }
    });
  },

  /**
   * 获取对方状态文案
   */
  getOtherPartyLabel: function (caseData, role) {
    if (!caseData) return '';

    var otherParty = role === 'party_a' ? caseData.party_b : caseData.party_a;

    if (role === 'party_a') {
      if (!otherParty.openid) return '等待加入';
      if (!otherParty.submitted) return '待提交';
      return '已提交';
    } else {
      if (!otherParty.submitted) return '待提交';
      return '已提交';
    }
  },

  /**
   * 点击上传证据
   */
  onUploadTap: function () {
    wx.navigateTo({
      url: '/pages/upload/upload?caseId=' + this.data.caseId + '&role=' + this.data.role,
    });
  },

  /**
   * 点击查看报告
   */
  onViewReportTap: function () {
    wx.navigateTo({
      url: '/pages/report/report?caseId=' + this.data.caseId,
    });
  },

  /**
   * 显示/隐藏邀请面板
   */
  onToggleInvitePanel: function () {
    this.setData({
      showInvitePanel: !this.data.showInvitePanel,
    });
  },

  /**
   * 邀请面板事件
   */
  onInvitePanelShare: function () {
    // 触发分享
  },
});
