// ═══════════════════════════════════════════════
// 首页 (v3) — 合规弹窗 + 单人模式 CTA
// ═══════════════════════════════════════════════

var caseService = require('../../services/case');
var formatUtil = require('../../utils/format');
var app = getApp();

Page({
  data: {
    caseList: [],
    loading: true,
    hasMore: true,
    page: 1,
    pageSize: 10,
    isEmpty: false,
    refreshing: false,
    creating: false,

    // 隐私同意弹窗
    showPrivacyModal: false,
  },

  onLoad: function () {
    this.loadCases();

    // 检查是否已同意隐私政策
    if (!app.hasAgreedPrivacy()) {
      this.setData({ showPrivacyModal: true });
    }
  },

  onShow: function () {
    if (this.data.caseList.length > 0) {
      this.refreshCases();
    }
  },

  onPullDownRefresh: function () {
    this.setData({ refreshing: true });
    this.refreshCases();
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  loadCases: function () {
    var that = this;
    this.setData({ loading: true, page: 1 });

    caseService.getCaseList({ page: 1, pageSize: this.data.pageSize }).then(function (res) {
      if (res.code === 0 && res.data) {
        var list = (res.data.list || []).map(function (item) {
          return that.formatCaseItem(item);
        });

        that.setData({
          caseList: list,
          loading: false,
          hasMore: res.data.hasMore || false,
          isEmpty: list.length === 0,
          refreshing: false,
        });
      } else {
        that.setData({ loading: false, isEmpty: true, refreshing: false });
      }
      wx.stopPullDownRefresh();
    }).catch(function () {
      that.setData({ loading: false, refreshing: false });
      wx.stopPullDownRefresh();
    });
  },

  refreshCases: function () {
    this.loadCases();
  },

  loadMore: function () {
    var that = this;
    var nextPage = this.data.page + 1;
    this.setData({ loading: true });

    caseService.getCaseList({ page: nextPage, pageSize: this.data.pageSize }).then(function (res) {
      if (res.code === 0 && res.data) {
        var newList = (res.data.list || []).map(function (item) {
          return that.formatCaseItem(item);
        });
        that.setData({
          caseList: that.data.caseList.concat(newList),
          page: nextPage,
          loading: false,
          hasMore: res.data.hasMore || false,
        });
      } else {
        that.setData({ loading: false });
      }
    }).catch(function () {
      that.setData({ loading: false });
    });
  },

  formatCaseItem: function (item) {
    item.formattedTime = formatUtil.formatTime(item.updatedAt || item.createdAt);
    item.statusLabel = this.getStatusLabel(item.status);
    item.statusType = this.getStatusType(item.status);
    item.isSingleMode = item.mode === 'single' || (!item.party_b || !item.party_b.openid);
    return item;
  },

  getStatusLabel: function (status) {
    var map = {
      'single_submitted': '已上传，待分析',
      'waiting_party_b': '等待对方加入',
      'waiting_submission': '等待提交',
      'analyzing': '分析中...',
      'single_completed': '分析完成',
      'completed': '分析完成',
      'expired': '已过期',
    };
    return map[status] || status || '未知';
  },

  getStatusType: function (status) {
    if (status === 'single_completed' || status === 'completed') return 'success';
    if (status === 'analyzing') return 'analyzing';
    if (status === 'expired') return 'expired';
    return 'pending';
  },

  /**
   * 一键开始分析 (v2 核心 CTA)
   * 自动创建单人模式案例 → 直接跳转上传页
   */
  onStartAnalyze: function () {
    var that = this;

    if (this.data.creating) return;
    this.setData({ creating: true });

    wx.showLoading({ title: '创建案例中...', mask: true });

    // 获取用户信息（可选）
    var userInfo = { nickname: '微信用户', avatarUrl: '' };
    try {
      var cache = wx.getStorageSync('userInfo');
      if (cache) userInfo = cache;
    } catch (_) {}

    caseService.createCase({
      title: '调解案例',
      relationship: '',
      privacy: 'both',
      mode: 'single',
      userInfo: userInfo,
    }).then(function (res) {
      wx.hideLoading();
      that.setData({ creating: false });

      if (res.code === 0 && res.data && res.data.caseId) {
        // 直接跳转到上传页
        wx.navigateTo({
          url: '/pages/upload/upload?caseId=' + res.data.caseId + '&mode=single',
        });
      } else {
        wx.showToast({ title: res.message || '创建失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      that.setData({ creating: false });
      wx.showToast({ title: '创建失败，请重试', icon: 'none' });
      console.error('创建案例失败:', err);
    });
  },

  /**
   * 点击案例卡片 → 根据状态跳转
   */
  onCaseTap: function (e) {
    var caseId = e.currentTarget.dataset.id;
    var status = e.currentTarget.dataset.status;

    if (status === 'single_completed' || status === 'completed') {
      // 分析完成 → 跳转报告页
      wx.navigateTo({
        url: '/pages/report/report?caseId=' + caseId,
      });
    } else {
      // 未完成 → 跳转详情/上传
      wx.navigateTo({
        url: '/pages/case-detail/case-detail?caseId=' + caseId,
      });
    }
  },

  /**
   * 分享配置（首页分享）
   */
  onShareAppMessage: function () {
    return {
      title: '啷个对 — 上传聊天记录，看谁更在理',
      path: '/pages/index/index',
      imageUrl: '',
    };
  },

  // ===== 隐私同意弹窗 (v3 合规新增) =====

  /**
   * 用户同意隐私政策
   */
  onAgreePrivacy: function () {
    app.agreePrivacy();
    this.setData({ showPrivacyModal: false });
  },

  /**
   * 用户不同意 — 退出小程序
   */
  onDisagreePrivacy: function () {
    wx.showModal({
      title: '提示',
      content: '需要同意隐私政策才能使用本小程序。',
      showCancel: false,
      confirmText: '我知道了',
      success: function () {
        // 返回上一页或关闭
        wx.navigateBack({ fail: function () { /* 已经是首页则不做操作 */ } });
      },
    });
  },

  /**
   * 打开隐私政策页
   */
  onViewPrivacy: function () {
    wx.navigateTo({
      url: '/pages/privacy/privacy',
    });
  },
});
