// ═══════════════════════════════════════════════
// 首页 — 案例列表 + 创建入口
// ═══════════════════════════════════════════════

var caseService = require('../../services/case');
var formatUtil = require('../../utils/format');

Page({
  data: {
    /** 案例列表 */
    caseList: [],
    /** 是否正在加载 */
    loading: true,
    /** 是否还有更多 */
    hasMore: true,
    /** 当前页码 */
    page: 1,
    /** 每页条数 */
    pageSize: 10,
    /** 是否为空 */
    isEmpty: false,
    /** 下拉刷新状态 */
    refreshing: false,
  },

  onLoad: function () {
    this.loadCases();
  },

  onShow: function () {
    // 从其他页面返回时刷新列表
    if (this.data.caseList.length > 0) {
      this.refreshCases();
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function () {
    this.setData({ refreshing: true });
    this.refreshCases();
  },

  /**
   * 上拉加载更多
   */
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  /**
   * 加载案例列表（首次）
   */
  loadCases: function () {
    var that = this;
    this.setData({ loading: true, page: 1 });

    caseService.getCaseList({ page: 1, pageSize: this.data.pageSize }).then(function (res) {
      if (res.code === 0 && res.data) {
        var list = (res.data.list || []).map(function (item) {
          item.formattedTime = formatUtil.formatTime(item.updatedAt);
          item.statusLabel = formatUtil.statusLabel(item.status);
          return item;
        });

        that.setData({
          caseList: list,
          loading: false,
          hasMore: res.data.hasMore,
          isEmpty: list.length === 0,
          refreshing: false,
        });
      } else {
        that.setData({ loading: false, isEmpty: true, refreshing: false });
      }
      wx.stopPullDownRefresh();
    }).catch(function (err) {
      console.error('加载案例列表失败:', err);
      that.setData({ loading: false, refreshing: false });
      wx.stopPullDownRefresh();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  /**
   * 刷新案例列表
   */
  refreshCases: function () {
    this.loadCases();
  },

  /**
   * 加载更多
   */
  loadMore: function () {
    var that = this;
    var nextPage = this.data.page + 1;

    this.setData({ loading: true });

    caseService.getCaseList({ page: nextPage, pageSize: this.data.pageSize }).then(function (res) {
      if (res.code === 0 && res.data) {
        var newList = (res.data.list || []).map(function (item) {
          item.formattedTime = formatUtil.formatTime(item.updatedAt);
          item.statusLabel = formatUtil.statusLabel(item.status);
          return item;
        });

        that.setData({
          caseList: that.data.caseList.concat(newList),
          page: nextPage,
          loading: false,
          hasMore: res.data.hasMore,
        });
      } else {
        that.setData({ loading: false });
      }
    }).catch(function (err) {
      console.error('加载更多失败:', err);
      that.setData({ loading: false });
    });
  },

  /**
   * 点击案例卡片 → 跳转详情
   */
  onCaseTap: function (e) {
    var caseId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/case-detail/case-detail?caseId=' + caseId,
    });
  },

  /**
   * 点击创建案例 CTA
   */
  onCreateTap: function () {
    wx.navigateTo({
      url: '/pages/create-case/create-case',
    });
  },

  /**
   * 分享邀请
   */
  onShareTap: function (e) {
    var caseId = e.currentTarget.dataset.id;
    var inviteCode = e.currentTarget.dataset.invitecode;

    // 跳转到案例详情页，触发分享
    wx.navigateTo({
      url: '/pages/case-detail/case-detail?caseId=' + caseId + '&action=share',
    });
  },
});
