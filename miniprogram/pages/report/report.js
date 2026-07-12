// ═══════════════════════════════════════════════
// 分析报告页 — 4 层递进结构
// ═══════════════════════════════════════════════

var caseService = require('../../services/case');
var analysisService = require('../../services/analysis');
var formatUtil = require('../../utils/format');

Page({
  data: {
    /** 案例 ID */
    caseId: '',
    /** 案例数据 */
    caseData: null,
    /** 分析数据 */
    analysis: null,
    /** 当前角色 */
    role: '',
    /** 分析进度 */
    progress: null,
    /** 是否加载中 */
    loading: true,
    /** 报告被隐私限制 */
    restricted: false,
    /** 受限提示 */
    restrictedMessage: '',
    /** 当前 tab */
    activeTab: 'characters',
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

  /**
   * 加载报告数据
   */
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

        // 检查隐私限制
        if (analysis && analysis.restricted) {
          that.setData({
            restricted: true,
            restrictedMessage: analysis.restrictedMessage,
            analysis: analysis,
          });
          return;
        }

        if (analysis) {
          // 检查是否分析完成
          if (analysis.progress && analysis.progress.step === 'done') {
            that.setData({ analysis: analysis, progress: analysis.progress });
          } else if (analysis.progress) {
            // 分析进行中，启动进度监听
            that.setData({
              analysis: analysis,
              progress: analysis.progress,
            });
            that.watchProgress(analysis._id);
          } else {
            // 无分析数据
            that.setData({
              analysis: null,
              progress: null,
            });
          }
        } else if (caseData.status === 'analyzing' && caseData.analysisId) {
          // 分析中但可能还没获取到，监听进度
          that.watchProgress(caseData.analysisId);
        }
      } else {
        that.setData({ loading: false });
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    }).catch(function (err) {
      console.error('加载报告失败:', err);
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  /**
   * 监听分析进度
   */
  watchProgress: function (analysisId) {
    var that = this;
    this._progressWatcher = analysisService.watchAnalysisProgress(analysisId, function (progress) {
      that.setData({ progress: progress });

      if (progress.step === 'done') {
        // 重新加载完整报告
        that.loadReport();
      }
    });
  },

  /**
   * Tab 切换
   */
  onTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  /**
   * 返回案例详情
   */
  onBack: function () {
    wx.navigateBack();
  },
});
