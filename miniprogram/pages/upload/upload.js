// ═══════════════════════════════════════════════
// 上传证据页 (v3) — 支持性格信息补充
// ═══════════════════════════════════════════════

var evidenceService = require('../../services/evidence');
var analysisService = require('../../services/analysis');
var caseService = require('../../services/case');

Page({
  data: {
    caseId: '',
    role: 'party_a',
    mode: 'single',
    uploadMode: '',
    chatText: '',
    note: '',
    submitting: false,
    selectedImageCount: 0,
    selectedFileName: '',
    showGuide: true,

    // 性格弹窗
    showPersonalityModal: false,
    personalitySubmitted: false,
  },

  onLoad: function (options) {
    this.setData({
      caseId: options.caseId || '',
      role: options.role || 'party_a',
      mode: options.mode || 'single',
      showGuide: true,
    });
  },

  onChooseMessageFile: function () {
    var that = this;
    evidenceService.chooseMessageFile().then(function (result) {
      that.setData({
        uploadMode: 'choose_file',
        chatText: result.content,
        selectedFileName: result.fileName,
        showGuide: false,
      });
      wx.showToast({ title: '已读取 ' + result.fileName, icon: 'success' });
    }).catch(function (err) {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
      wx.showToast({ title: '选择文件失败', icon: 'none' });
    });
  },

  onChooseMedia: function () {
    var that = this;
    evidenceService.chooseMedia(9).then(function (result) {
      that.setData({
        uploadMode: 'album',
        selectedImageCount: result.tempFilePaths.length,
        chatText: '[截图已选择] ' + result.tempFilePaths.length + ' 张截图。OCR 识别将在后续版本支持，建议使用方法一（粘贴文本）获得最佳体验。',
        showGuide: false,
      });
    }).catch(function (err) {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
    });
  },

  onPasteText: function () {
    this.setData({ uploadMode: 'paste', showGuide: false });
  },

  onTextInput: function (e) {
    this.setData({ chatText: e.detail.value });
  },

  onNoteInput: function (e) {
    this.setData({ note: e.detail.value });
  },

  onSubmit: function () {
    var that = this;

    if (this.data.submitting) return;

    if (!this.data.chatText || !this.data.chatText.trim()) {
      wx.showToast({ title: '请先上传或输入聊天记录', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    evidenceService.uploadEvidence({
      caseId: this.data.caseId,
      rawText: this.data.chatText,
      note: this.data.note,
    }).then(function (res) {
      wx.hideLoading();

      if (res.code === 0 && res.data) {
        wx.showToast({ title: '提交成功', icon: 'success' });

        // 弹出性格信息弹窗
        that.setData({
          showPersonalityModal: true,
        });
      } else {
        that.setData({ submitting: false });
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    }).catch(function () {
      wx.hideLoading();
      that.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    });
  },

  // ===== 性格信息弹窗 =====

  /**
   * 补充性格信息并开始分析
   */
  onPersonalityConfirm: function () {
    var that = this;
    var picker = this.selectComponent('#personalityPicker');

    if (picker && picker.hasAnyData()) {
      var data = picker.getData();
      caseService.updatePersonality(
        this.data.caseId,
        data.personalityA,
        data.personalityB
      ).then(function () {
        that._startAnalysis();
      }).catch(function () {
        // 性格保存失败也继续分析
        that._startAnalysis();
      });
    } else {
      this._startAnalysis();
    }
  },

  /**
   * 跳过性格信息，直接分析
   */
  onPersonalitySkip: function () {
    this._startAnalysis();
  },

  /**
   * 开始分析并跳转
   */
  _startAnalysis: function () {
    var that = this;
    this.setData({ showPersonalityModal: false });

    analysisService.analyzeCase(this.data.caseId).then(function (analysisRes) {
      if (analysisRes.code === 0) {
        wx.redirectTo({
          url: '/pages/report/report?caseId=' + that.data.caseId,
        });
      } else {
        wx.showToast({ title: analysisRes.message || '分析启动失败', icon: 'none' });
        wx.redirectTo({
          url: '/pages/report/report?caseId=' + that.data.caseId,
        });
      }
    }).catch(function () {
      wx.redirectTo({
        url: '/pages/report/report?caseId=' + that.data.caseId,
      });
    });
  },
});
