// ═══════════════════════════════════════════════
// 案例详情页 — 双人状态面板 + 操作区 + 邀请面板
// ═══════════════════════════════════════════════

var caseService = require('../../services/case');
var formatUtil = require('../../utils/format');

Page({
  data: {
    /** 案例 ID */
    caseId: '',
    /** 邀请码 */
    inviteCode: '',
    /** 是否加入中 */
    joining: false,
    /** 加入错误信息 */
    joinError: '',
    /** 是否显示加入提示 */
    showJoinPrompt: false,
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
    var inviteCode = options.inviteCode || '';
    // 强制重置状态，防止旧案例数据残留
    this.setData({
      caseId: caseId,
      inviteCode: inviteCode,
      caseData: null,
      analysis: null,
      myEvidence: null,
      otherEvidence: null,
      loading: inviteCode ? false : true, // 有邀请码时不立刻显示 loading（先显示加入按钮）
      joining: false,
      joinError: '',
    });
    if (this._watcher) { this._watcher.close(); this._watcher = null; }

    if (options.action === 'share') {
      this.setData({ showInvitePanel: true });
    }

    // 有邀请码且非甲方：需要先加入再加载
    if (inviteCode) {
      this.setData({
        loading: false,
        showJoinPrompt: true,
      });
    } else {
      this.loadDetail();
      this.startWatch();
    }
  },

  onShow: function () {
    // 从其他页面返回时重新加载，确保数据最新
    var pages = getCurrentPages();
    var currentPage = pages[pages.length - 1];
    var options = currentPage.options || {};

    // 如果还没加入且没数据，重新检查邀请码
    if (!this.data.caseData && this.data.inviteCode) {
      this.setData({ showJoinPrompt: true });
      return;
    }

    if (options.caseId && options.caseId !== this.data.caseId) {
      if (this._watcher) { this._watcher.close(); this._watcher = null; }
      this.setData({ caseId: options.caseId, caseData: null, analysis: null, loading: true });
      this.loadDetail();
      this.startWatch();
    } else {
      // 同一个案例，刷新数据
      this.loadDetail();
    }
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
    var active = true;
    var timer = null;
    function poll() {
      if (!active) return;
      caseService.getCaseDetail(that.data.caseId, { summaryOnly: true }).then(function (res) {
        var doc = res.code === 0 && res.data && res.data.caseData;
        if (doc) {
          var oldCase = that.data.caseData;
          var oldStatus = oldCase ? oldCase.status : '';
          var oldPartyBOpenid = oldCase && oldCase.party_b ? oldCase.party_b.openid : null;
          var oldPartyBSubmitted = !!(oldCase && oldCase.party_b && oldCase.party_b.submitted);
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
            } else if (doc.status === 'analyzing') {
              wx.showToast({ title: '一方已启动分析，证据已锁定', icon: 'none' });
            } else if (doc.status === 'cancel_requested') {
              wx.showToast({ title: '正在打断分析', icon: 'none' });
            } else if (doc.status === 'dual_collecting' && oldStatus === 'cancel_requested') {
              wx.showToast({ title: '分析已打断，可以继续补证', icon: 'success' });
            } else if (doc.status === 'dual_a_submitted') {
              wx.showToast({ title: '甲方分析完成，等待补充', icon: 'none' });
              that.loadDetail();
            } else if (doc.status === 'dual_b_submitted') {
              wx.showToast({ title: '双方辩论分析完成！', icon: 'success' });
              that.loadDetail();
            }
          }

          // 对方加入/提交提示
          if (that.data.role === 'party_a') {
            if (!oldPartyBOpenid && doc.party_b.openid) {
              wx.showToast({ title: '乙方已加入！', icon: 'success' });
              that.setData({ showInvitePanel: false });
            }
            if (!oldPartyBSubmitted && doc.party_b.submitted) {
              wx.showToast({ title: '乙方已提交证据', icon: 'none' });
            }
          }
        }
      }).catch(function (err) {
        console.warn('案例状态轮询失败:', err);
      }).then(function () {
        if (active) timer = setTimeout(poll, 2000);
      });
    }
    poll();
    this._watcher = {
      close: function () {
        active = false;
        if (timer) clearTimeout(timer);
      },
    };
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
      // 辩论模式：乙方已补充
      if (caseData.status === 'dual_b_submitted') return '乙方已补充';
      return '已提交';
    } else {
      if (!otherParty.submitted) return '待提交';
      // 辩论模式：甲方已分析完成，待乙方补充
      if (caseData.status === 'dual_a_submitted') return '甲方已分析，待补充';
      return '已提交';
    }
  },

  /**
   * 点击上传证据
   */
  onUploadTap: function () {
    if (this.data.caseData && (this.data.caseData.analysisLock === true || this.data.caseData.status === 'analyzing' || this.data.caseData.status === 'cancel_requested')) {
      wx.showToast({ title: '分析期间证据已锁定', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/upload/upload?caseId=' + this.data.caseId + '&role=' + this.data.role + '&mode=dual&supplement=' + (this.data.myEvidence ? '1' : '0'),
    });
  },

  /**
   * 加入案例（双人模式，乙方通过邀请码加入）
   */
  onJoinCase: function () {
    var that = this;
    var inviteCode = this.data.inviteCode;

    if (!inviteCode || this.data.joining) return;

    this.setData({ joining: true, joinError: '' });

    wx.showLoading({ title: '正在加入...', mask: true });

    caseService.joinCase({
      inviteCode: inviteCode,
      userInfo: { nickname: '微信用户', avatarUrl: '' },
    }).then(function (res) {
      wx.hideLoading();
      if (res.code === 0) {
        that.setData({
          inviteCode: '',
          showJoinPrompt: false,
          joining: false,
          loading: true,
          role: 'party_b',
        });
        wx.showToast({ title: '加入成功！', icon: 'success' });
        that.loadDetail();
        that.startWatch();
      } else {
        that.setData({
          joining: false,
          joinError: res.message || '加入失败',
        });
        wx.showToast({ title: res.message || '加入失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      that.setData({
        joining: false,
        joinError: err.message || '网络错误',
      });
      wx.showToast({ title: '加入失败，请重试', icon: 'none' });
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
