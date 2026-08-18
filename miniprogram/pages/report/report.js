// ═══════════════════════════════════════════════
// 分析报告页 (V3) — 证据版本、规则质量与中性报告
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

    canceling: false,
    /** 是否为补充内容后的重新分析 */
    isReanalysis: false,
  },

  onLoad: function (options) {
    // 清理旧状态
    this._cleanup();

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
        progress: { step: 'queued', message: '分析已进入队列...', progress: 0 },
      });
      // 如果有传 analysisId，直接记下来，避免 loadReport 的竞态
      if (options.analysisId) {
        this._analysisId = options.analysisId;
        this.watchProgress(options.analysisId);
      }
    }

    this.loadReport();
    this._startPolling();
  },

  onUnload: function () {
    this._cleanup();
  },

  onHide: function () {
    if (this._progressWatcher) {
      this._progressWatcher.close();
      this._progressWatcher = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._clearStuckTimer();
  },

  onShow: function () {
    // 检测是否从补充证据页返回（由 upload.js 设置 _pendingSupplementRefresh）
    if (this._pendingSupplementRefresh) {
      var pendingAnalysisId = this._pendingSupplementRefresh;
      this._pendingSupplementRefresh = null;
      this._cleanup();
      this.setData({
        caseData: null,
        analysis: null,
        progress: null,
        progressStuck: false,
        loading: true,
        caseId: this.data.caseId,
      });
      // 记录新 analysisId，让 loadReport 和 _startPolling 能通过它加载新分析
      if (pendingAnalysisId && pendingAnalysisId !== true) {
        this._analysisId = pendingAnalysisId;
      }
      // loadReport 内部会 watchProgress（如果分析还在进行中）
      this.loadReport();
      this._startPolling();
      return;
    }

    // 确保每次页面显示时都刷新（解决返回再进入时数据不更新）
    var pages = getCurrentPages();
    var currentPage = pages[pages.length - 1];
    var options = currentPage.options || {};
    var newCaseId = options.caseId || '';

    if (newCaseId && newCaseId !== this.data.caseId) {
      this._cleanup();
      this.setData({
        caseId: newCaseId,
        caseData: null,
        analysis: null,
        progress: null,
        progressStuck: false,
        loading: true,
      });
      this.loadReport();
      this._startPolling();
    } else if (this.data.caseId && !this._progressWatcher && this._isAnalyzing()) {
      this.loadReport();
      this._startPolling();
    }
  },

  /**
   * 清理所有定时器和监听器
   */
  _cleanup: function () {
    this._analysisId = null;
    if (this._progressWatcher) {
      this._progressWatcher.close();
      this._progressWatcher = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._clearStuckTimer();
  },

  /**
   * 启动分析 ID 发现轮询；进度由 analysisService 的单一受权轮询负责。
   * 注意：_analysisId 可能延迟设置（loadReport 异步加载），首次 tick 若为 null
   * 直接跳过继续等待下一轮，不可清除定时器。
   */
  _startPolling: function () {
    var that = this;
    if (this._pollTimer) clearInterval(this._pollTimer);
    // 轮询最大次数：60 次 * 3s = 180s（云函数 120s timeout + 余量）
    var maxTicks = 60;
    var tickCount = 0;
    this._pollTimer = setInterval(function () {
      tickCount++;
      // 超限则停止轮询，释放资源
      if (tickCount > maxTicks) {
        clearInterval(that._pollTimer);
        that._pollTimer = null;
        return;
      }
      // _analysisId 还没设上（loadReport 未完成），先查 case 数据获取
      if (!that._analysisId) {
        caseService.getCaseDetail(that.data.caseId, { summaryOnly: true }).then(function (res) {
            var caseData = res.code === 0 && res.data && res.data.caseData;
            if (caseData && caseData.analysisId) {
              that._analysisId = caseData.analysisId;
              that.watchProgress(caseData.analysisId);
            }
        }).catch(function () {});
        return;
      }
      // 分析已完成，停止轮询
      if (!that._isAnalyzing()) {
        clearInterval(that._pollTimer);
        that._pollTimer = null;
        return;
      }
      // 已建立进度监听后不再发起第二套轮询。
    }, 3000);
  },

  /**
   * 判断当前是否处于分析中的状态
   */
  _isAnalyzing: function () {
    var progress = this.data.progress;
    return !progress || (progress.step !== 'done' && progress.step !== 'error' && progress.step !== 'canceled');
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
            that.setData({
              analysis: analysis,
              progress: analysis.progress,
              progressStuck: false,
              isReanalysis: analysis.isReanalysis === true || Number(analysis.lockedEvidenceRevision || analysis.evidenceRevision) > 1,
            });
            // 已完成，停止轮询
            if (that._pollTimer) {
              clearInterval(that._pollTimer);
              that._pollTimer = null;
            }
            // 关闭进度监听，清除卡住定时器
            if (that._progressWatcher) {
              that._progressWatcher.close();
              that._progressWatcher = null;
            }
            that._clearStuckTimer();
          } else if (analysis.progress) {
            that.setData({ analysis: analysis, progress: analysis.progress });
            that._analysisId = analysis._id;
            that.watchProgress(analysis._id);
          } else {
            that.setData({ analysis: null, progress: null });
          }
        } else if (
          (caseData.status === 'analyzing' || caseData.status === 'single_submitted') &&
          caseData.analysisId
        ) {
          that._analysisId = caseData.analysisId;
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

    this._clearStuckTimer();

    this._stuckTimer = setTimeout(function () {
      that.setData({ progressStuck: true });
    }, 90000);

    this._progressWatcher = analysisService.watchAnalysisProgress(analysisId, function (progress) {
      that.setData({ progress: progress, progressStuck: false });
      that._clearStuckTimer();
      that._stuckTimer = setTimeout(function () {
        that.setData({ progressStuck: true });
      }, 90000);

      if (progress.step === 'done' || progress.step === 'error' || progress.step === 'canceled') {
        that._clearStuckTimer();
        // 清理轮询（已完成）
        if (that._pollTimer) {
          clearInterval(that._pollTimer);
          that._pollTimer = null;
        }
        that.loadReport();
      }
    });
  },

  /**
   * 清除卡住定时器
   */
  _clearStuckTimer: function () {
    if (this._stuckTimer) {
      clearTimeout(this._stuckTimer);
      this._stuckTimer = null;
    }
  },

  onTabChange: function (e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  onBack: function () {
    wx.navigateBack();
  },

  // ===== 分享功能 =====

  onOpenShare: function () {
    this.setData({ showSharePanel: true });
  },

  onCloseShare: function () {
    this.setData({ showSharePanel: false });
  },

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

  onShareAppMessage: function () {
    var analysis = this.data.analysis;
    var revision = analysis && (analysis.lockedEvidenceRevision || analysis.evidenceRevision) || 1;
    return {
      title: '啷个对：第 ' + revision + ' 版证据的分歧与下一步',
      path: '/pages/report/report?caseId=' + this.data.caseId,
      imageUrl: '',
    };
  },

  onShareTimeline: function () {
    return {
      title: '啷个对 — 先整理事实，再看见分歧',
      query: 'caseId=' + this.data.caseId,
      imageUrl: '',
    };
  },

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

  onRetryAnalyze: function () {
    var that = this;

    if (this._progressWatcher) {
      this._progressWatcher.close();
    }

    this.setData({ progressStuck: false, progress: null });
    wx.showLoading({ title: '正在重新分析...', mask: true });

    analysisService.analyzeCase(this.data.caseId, true).then(function (res) {
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

  /**
   * 补充聊天内容，重新分析
   * 跳转到上传页（带 supplement 参数）
   */
  onSupplementEvidence: function () {
    if (this._isAnalyzing() && this._analysisId) {
      this.onCancelAndSupplement();
      return;
    }
    wx.navigateTo({
      url: '/pages/upload/upload?caseId=' + this.data.caseId + '&supplement=1',
    });
  },

  onCancelAndSupplement: function () {
    var that = this;
    if (!this._analysisId || this.data.canceling) return;
    wx.showModal({
      title: '打断当前分析？',
      content: '打断完成后，双方才能继续补充证据。本轮未完成结果不会被采用。',
      confirmText: '打断并补证',
      success: function (modalResult) {
        if (!modalResult.confirm) return;
        that.setData({ canceling: true });
        wx.showLoading({ title: '正在打断...', mask: true });
        analysisService.cancelAnalysis(that._analysisId).then(function (result) {
          var status = result.data && result.data.status;
          if (status === 'canceled') return status;
          return that._waitForCancellation(that._analysisId, 0);
        }).then(function () {
          wx.hideLoading();
          that.setData({ canceling: false });
          wx.navigateTo({ url: '/pages/upload/upload?caseId=' + that.data.caseId + '&supplement=1' });
        }).catch(function (error) {
          wx.hideLoading();
          that.setData({ canceling: false });
          if (error && error.errorCode === 'ANALYSIS_ALREADY_COMPLETED') {
            wx.navigateTo({ url: '/pages/upload/upload?caseId=' + that.data.caseId + '&supplement=1' });
            return;
          }
          wx.showToast({ title: error && error.message || '打断失败，请重试', icon: 'none' });
        });
      },
    });
  },

  _waitForCancellation: function (analysisId, attempt) {
    var that = this;
    if (attempt >= 40) return Promise.reject(new Error('打断超时，请稍后重试'));
    return new Promise(function (resolve) { setTimeout(resolve, 1500); }).then(function () {
      return analysisService.getAnalysis(analysisId);
    }).then(function (analysis) {
      if (analysis && analysis.status === 'canceled') return 'canceled';
      if (analysis && analysis.status === 'completed') {
        var completed = new Error('本轮分析已完成');
        completed.errorCode = 'ANALYSIS_ALREADY_COMPLETED';
        throw completed;
      }
      return that._waitForCancellation(analysisId, attempt + 1);
    });
  },

});
