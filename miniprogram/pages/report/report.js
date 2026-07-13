// ═══════════════════════════════════════════════
// 分析报告页 (v3) — 性格信息展示 + 重新分析
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
    progressStuck: false,
    loading: true,
    restricted: false,
    restrictedMessage: '',
    activeTab: 'characters',

    // 分享相关
    showSharePanel: false,
    shareCardData: null,
    shareLoading: false,

    // 性格信息
    showPersonalityEditor: false,
    personalityA: null,
    personalityB: null,
    reanalyzing: false,
  },

  onLoad: function (options) {
    // 每次进入报告页都强制刷新——防止导航栈中遗留旧案例数据
    this._analysisId = null;
    if (this._progressWatcher) {
      this._progressWatcher.close();
      this._progressWatcher = null;
    }

    this.setData({
      caseId: options.caseId || '',
      analysis: null,
      progress: null,
      progressStuck: false,
      loading: true,
    });

    // 如果是从上传页跳过来的（analysis 刚刚提交），先显示分析中
    if (options.analyzing === '1') {
      this.setData({
        loading: false,
        progress: { step: 'parsing', message: '分析已提交，正在准备中...', progress: 0 },
      });
    }

    this.loadReport();
  },

  onUnload: function () {
    if (this._progressWatcher) {
      this._progressWatcher.close();
      this._progressWatcher = null;
    }
  },

  onShow: function () {
    // 确保每次页面显示时都刷新（解决返回再进入时数据不更新）
    var pages = getCurrentPages();
    var currentPage = pages[pages.length - 1];
    var options = currentPage.options || {};
    var newCaseId = options.caseId || '';

    if (newCaseId && newCaseId !== this.data.caseId) {
      // caseId 变了，完全重新加载
      if (this._progressWatcher) {
        this._progressWatcher.close();
        this._progressWatcher = null;
      }
      this.setData({
        caseId: newCaseId,
        caseData: null,
        analysis: null,
        progress: null,
        progressStuck: false,
        loading: true,
      });
      this.loadReport();
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
          personalityA: (caseData.party_a && caseData.party_a.personality) || null,
          personalityB: (caseData.party_b && caseData.party_b.personality) || null,
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
    var stuckTimer = null;

    function setStuckTimer() {
      if (stuckTimer) clearTimeout(stuckTimer);
      stuckTimer = setTimeout(function () {
        that.setData({ progressStuck: true });
      }, 90000);
    }

    this._progressWatcher = analysisService.watchAnalysisProgress(analysisId, function (progress) {
      that.setData({ progress: progress, progressStuck: false });
      setStuckTimer();

      if (progress.step === 'done' || progress.step === 'error') {
        if (stuckTimer) clearTimeout(stuckTimer);
        that.loadReport();
      }
    });

    setStuckTimer();
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

    var title = '啷个对';
    if (analysis && analysis.coreConclusion) {
      var winner = analysis.coreConclusion.overallWinner;
      if (winner === 'party_a') {
        title = '啷个对？AI 说' + (caseData && caseData.party_a ? caseData.party_a.nickname : '甲方') + '更在理！';
      } else if (winner === 'party_b') {
        title = '啷个对？AI 说' + (caseData && caseData.party_b ? caseData.party_b.nickname : '乙方') + '更在理！';
      } else {
        title = '啷个对：都有道理';
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
      title: '啷个对 — 粘贴聊天记录，看谁更在理',
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
        that.setData({ progressStuck: false });
        that.loadReport();
      } else {
        wx.showToast({ title: res.message || '分析失败', icon: 'none' });
      }
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: '分析失败，请重试', icon: 'none' });
    });
  },

  /**
   * 分析卡住后重新分析
   */
  onRetryAnalyze: function () {
    var that = this;

    if (this._progressWatcher) {
      this._progressWatcher.close();
    }

    this.setData({ progressStuck: false, progress: null });
    wx.showLoading({ title: '正在重新分析...', mask: true });

    analysisService.analyzeCase(this.data.caseId).then(function (res) {
      wx.hideLoading();
      if (res.code === 0) {
        that.loadReport();
      } else {
        wx.showToast({ title: res.message || '启动失败', icon: 'none' });
        that.setData({ progressStuck: true });
      }
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      that.setData({ progressStuck: true });
    });
  },

  // ===== 性格信息 (v3 新增) =====

  /**
   * 打开性格编辑器
   */
  onEditPersonality: function () {
    this.setData({ showPersonalityEditor: true });
  },

  /**
   * 关闭性格编辑器
   */
  onClosePersonalityEditor: function () {
    this.setData({ showPersonalityEditor: false });
  },

  /**
   * 保存性格信息并重新分析
   */
  onSavePersonality: function () {
    var that = this;
    var picker = this.selectComponent('#reportPersonalityPicker');

    if (!picker || !picker.hasAnyData()) {
      wx.showToast({ title: '请至少填写一项信息', icon: 'none' });
      return;
    }

    var data = picker.getData();
    this.setData({ showPersonalityEditor: false, reanalyzing: true });

    wx.showLoading({ title: '正在保存并重新分析...', mask: true });

    caseService.updatePersonality(
          that.data.caseId,
          data.personalityA,
          data.personalityB
        ).then(function () {
          return analysisService.analyzeCase(that.data.caseId);
        }).then(function (analysisRes) {
          wx.hideLoading();
          that.setData({ reanalyzing: false });

          if (analysisRes.code === 0) {
            wx.showToast({ title: '分析已重新开始', icon: 'success' });
            that.loadReport();
          } else {
            wx.showToast({ title: analysisRes.message || '分析失败', icon: 'none' });
          }
        }).catch(function () {
          wx.hideLoading();
          that.setData({ reanalyzing: false });
          wx.showToast({ title: '操作失败，请重试', icon: 'none' });
        });
  },

  /**
   * 格式化性格信息为展示文本
   */
  _formatPersonalityDisplay: function (p) {
    if (!p) return null;
    var parts = [];
    if (p.mbti) parts.push(p.mbti);
    if (p.zodiac) {
      var personalityUtil = require('../../utils/personality');
      parts.push(personalityUtil.getZodiacLabel(p.zodiac) || p.zodiac);
    }
    if (p.element) parts.push(p.element);
    return parts.length > 0 ? parts.join(' / ') : null;
  },
});
