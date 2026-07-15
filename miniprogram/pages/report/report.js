// ═══════════════════════════════════════════════
// 分析报告页 (v4) — 轮询保底 + 实时监听
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
    /** 是否为补充证据后的重新分析 */
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
        progress: { step: 'parsing', message: '分析已提交，正在准备中...', progress: 0 },
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

  onShow: function () {
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
   * 启动自动轮询（每 3 秒检查一次分析状态，作为 watch 的保底机制）
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
        var db = wx.cloud.database();
        db.collection('cases').doc(that.data.caseId).field({ analysisId: true, status: true }).get({
          success: function (res) {
            if (res.data && res.data.analysisId) {
              that._analysisId = res.data.analysisId;
              that.watchProgress(res.data.analysisId);
            }
          },
          fail: function () {},
        });
        return;
      }
      // 分析已完成，停止轮询
      if (!that._isAnalyzing()) {
        clearInterval(that._pollTimer);
        that._pollTimer = null;
        return;
      }
      // 通过 DB 直接查询分析进度
      var db = wx.cloud.database();
      db.collection('analyses').doc(that._analysisId).field({ progress: true }).get({
        success: function (res) {
          var progress = res.data && res.data.progress;
          if (progress) {
            that.setData({ progress: progress, progressStuck: false });
            if (progress.step === 'done' || progress.step === 'error') {
              clearInterval(that._pollTimer);
              that._pollTimer = null;
              that.loadReport();
            }
          }
        },
        fail: function () {},
      });
    }, 3000);
  },

  /**
   * 判断当前是否处于分析中的状态
   */
  _isAnalyzing: function () {
    var progress = this.data.progress;
    return !progress || (progress.step !== 'done' && progress.step !== 'error');
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
            that.setData({ analysis: analysis, progress: analysis.progress, progressStuck: false, isReanalysis: analysis.isReanalysis === true });
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

      if (progress.step === 'done' || progress.step === 'error') {
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

  onShareTimeline: function () {
    return {
      title: '啷个对 — 粘贴聊天记录，看谁更在理',
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
   * 补充证据并重新分析
   * 跳转到上传页（带 supplement 参数），提交后自动触发重新分析
   */
  onSupplementEvidence: function () {
    wx.navigateTo({
      url: '/pages/upload/upload?caseId=' + this.data.caseId + '&supplement=1',
    });
  },

  // ===== 性格信息 =====

  onEditPersonality: function () {
    this.setData({ showPersonalityEditor: true });
  },

  onClosePersonalityEditor: function () {
    this.setData({ showPersonalityEditor: false });
  },

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
          return analysisService.analyzeCase(that.data.caseId, true);
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
