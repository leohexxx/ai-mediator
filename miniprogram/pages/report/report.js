// ═══════════════════════════════════════════════
// 分析报告页 (v2) — 4 层结构 + 分享功能
// ═══════════════════════════════════════════════

var caseService = require('../../services/case');
var analysisService = require('../../services/analysis');
var formatUtil = require('../../utils/format');

Page({
  data: {
    caseId: '',
    caseData: null,
    analysis: null,
    role: '',
    progress: null,
    loading: true,
    restricted: false,
    restrictedMessage: '',
    activeTab: 'characters',

    // 分享相关
    showSharePanel: false,
    shareCardData: null,
    shareLoading: false,
  },

  onLoad: function (options) {
    this.setData({ caseId: options.caseId || '' });
    this.loadReport();
  },

  onUnload: function () {
    if (this._progressWatcher) {
      this._progressWatcher.close();
      this._progressWatcher = null;
    }
  },

  loadReport: function () {
    var that = this;
    this.setData({ loading: true });

    caseService.getCaseDetail(this.data.caseId).then(function (res) {
      if (res.code === 0 && res.data) {
        var caseData = res.data.caseData;
        var analysis = res.data.analysis;

        that.setData({
          caseData: caseData,
          role: res.data.role,
          loading: false,
        });

        if (analysis && analysis.restricted) {
          that.setData({
            restricted: true,
            restrictedMessage: analysis.restrictedMessage,
            analysis: analysis,
          });
          return;
        }

        if (analysis) {
          if (analysis.progress && analysis.progress.step === 'done') {
            that.setData({ analysis: analysis, progress: analysis.progress });
          } else if (analysis.progress) {
            that.setData({ analysis: analysis, progress: analysis.progress });
            that.watchProgress(analysis._id);
          } else {
            that.setData({ analysis: null, progress: null });
          }
        } else if (
          (caseData.status === 'analyzing' || caseData.status === 'single_submitted') &&
          caseData.analysisId
        ) {
          that.watchProgress(caseData.analysisId);
        }
      } else {
        that.setData({ loading: false });
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    }).catch(function () {
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  watchProgress: function (analysisId) {
    var that = this;
    this._progressWatcher = analysisService.watchAnalysisProgress(analysisId, function (progress) {
      that.setData({ progress: progress });
      if (progress.step === 'done') {
        that.loadReport();
      }
    });
  },

  onTabChange: function (e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  onBack: function () {
    wx.navigateBack();
  },

  // ===== 分享功能 (v2 新增) =====

  /**
   * 打开分享面板
   */
  onOpenShare: function () {
    this.setData({ showSharePanel: true });
  },

  /**
   * 关闭分享面板
   */
  onCloseShare: function () {
    this.setData({ showSharePanel: false });
  },

  /**
   * 选择分享模板并获取卡片数据
   */
  onSelectShareTemplate: function (e) {
    var that = this;
    var template = e.currentTarget.dataset.template || 'verdict';

    this.setData({ shareLoading: true });

    caseService.getShareCard(this.data.caseId, template).then(function (res) {
      that.setData({ shareLoading: false });

      if (res.code === 0 && res.data && res.data.cardData) {
        that.setData({
          shareCardData: res.data.cardData,
          showSharePanel: false,
        });

        // 通知 share-card 组件绘制
        var shareCard = that.selectComponent('#shareCard');
        if (shareCard) {
          shareCard.drawCard(res.data.cardData);
        }
      } else {
        wx.showToast({ title: res.message || '生成卡片失败', icon: 'none' });
      }
    }).catch(function () {
      that.setData({ shareLoading: false });
      wx.showToast({ title: '生成卡片失败，请重试', icon: 'none' });
    });
  },

  /**
   * 分享到聊天
   */
  onShareAppMessage: function () {
    var analysis = this.data.analysis;
    var caseData = this.data.caseData;

    var title = 'AI 调解员';
    if (analysis && analysis.coreConclusion) {
      var winner = analysis.coreConclusion.overallWinner;
      if (winner === 'party_a') {
        title = 'AI 说' + (caseData && caseData.party_a ? caseData.party_a.nickname : '甲方') + '更有理！';
      } else if (winner === 'party_b') {
        title = 'AI 说' + (caseData && caseData.party_b ? caseData.party_b.nickname : '乙方') + '更有理！';
      } else {
        title = 'AI 调解员：双方各有道理';
      }
    }

    return {
      title: title,
      path: '/pages/report/report?caseId=' + this.data.caseId,
      imageUrl: '',
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function () {
    return {
      title: 'AI 调解员 — 上传聊天记录，看谁更有理',
      query: 'caseId=' + this.data.caseId,
      imageUrl: '',
    };
  },

  /**
   * 手动触发分析
   */
  onManualAnalyze: function () {
    var that = this;
    wx.showLoading({ title: '正在启动分析...', mask: true });

    analysisService.analyzeCase(this.data.caseId).then(function (res) {
      wx.hideLoading();
      if (res.code === 0) {
        that.loadReport();
      } else {
        wx.showToast({ title: res.message || '分析失败', icon: 'none' });
      }
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: '分析失败，请重试', icon: 'none' });
    });
  },
});
