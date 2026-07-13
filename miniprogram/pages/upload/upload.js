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
    // 图片/视频 OCR 进度
    ocrProgress: { current: 0, total: 0 },
    ocrProcessing: false,
    uploadedFileIds: [],
    // 视频
    videoPath: '',
    videoContext: null,

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
      var imageCount = result.tempFilePaths.length;

      // 先显示选中状态
      that.setData({
        uploadMode: 'album',
        selectedImageCount: imageCount,
        chatText: '',
        showGuide: false,
        ocrProcessing: true,
        ocrProgress: { current: 0, total: imageCount },
      });

      wx.showLoading({ title: '上传并识别中...', mask: true });

      // 上传图片 + OCR 识别
      evidenceService.uploadImagesAndOCR(
        result.tempFilePaths,
        that.data.caseId,
        function (current, total) {
          // 更新进度
          that.setData({
            ocrProgress: { current: current, total: total },
          });
          wx.showLoading({
            title: '识别中 ' + current + '/' + total + '...',
            mask: true,
          });
        }
      ).then(function (ocrResult) {
        wx.hideLoading();

        var extractedText = ocrResult.text || '';
        that.setData({
          ocrProcessing: false,
          ocrProgress: { current: imageCount, total: imageCount },
          chatText: extractedText,
          uploadedFileIds: ocrResult.fileIds,
        });

        if (extractedText.trim()) {
          wx.showToast({ title: '识别成功 ' + imageCount + ' 张', icon: 'success' });
        } else {
          wx.showToast({ title: '未识别到文字', icon: 'none' });
        }
      }).catch(function (err) {
        wx.hideLoading();
        console.error('OCR 失败:', err);

        that.setData({
          ocrProcessing: false,
          chatText: '[截图处理失败: ' + (err.message || '请重试') + '。您可以改用"直接粘贴文本"方式上传。]',
        });
        wx.showToast({ title: '识别失败，请重试', icon: 'none' });
      });
    }).catch(function (err) {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
      console.error('选择图片失败:', err);
    });
  },

  onPasteText: function () {
    this.setData({ uploadMode: 'paste', showGuide: false });
  },

  // ===== 视频/录屏上传 =====

  /**
   * 选择视频或录屏 — 上传到云存储，作为证据保存
   */
  onChooseVideo: function () {
    var that = this;

    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 300,
      success: function (res) {
        var videoFile = res.tempFiles[0];
        var videoPath = videoFile.tempFilePath;
        var fileSizeMB = (videoFile.size / 1024 / 1024).toFixed(1);
        var duration = Math.floor(videoFile.duration || 0);

        that.setData({
          uploadMode: 'video',
          videoPath: videoPath,
          showGuide: false,
          ocrProcessing: true,
          selectedImageCount: 1,
          ocrProgress: { current: 0, total: 1 },
        });

        wx.showLoading({ title: '上传视频中...', mask: true });

        // 上传视频到云存储
        evidenceService.uploadVideoToCloud(videoPath, that.data.caseId).then(function (videoFileID) {
          wx.hideLoading();

          var infoText = '[视频证据已上传]\n' +
            '时长: ' + duration + ' 秒\n' +
            '大小: ' + fileSizeMB + ' MB\n' +
            '视频已保存至云端，作为证据附件。\n' +
            '如需提取视频中的聊天文字，建议同时粘贴文本内容，或使用截图方式上传。';

          that.setData({
            ocrProcessing: false,
            selectedImageCount: 1,
            ocrProgress: { current: 1, total: 1 },
            chatText: infoText,
            uploadedFileIds: [videoFileID],
          });

          wx.showToast({ title: '视频上传成功', icon: 'success' });
        }).catch(function (err) {
          wx.hideLoading();
          that.setData({
            ocrProcessing: false,
            chatText: '[视频上传失败: ' + (err.message || '请重试') + '。建议改用截图方式上传。]',
          });
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      },
    });
  },

  /** 视频 seek 完成（预留，video 组件需要） */
  onVideoSeeked: function () {},

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
      fileIds: this.data.uploadedFileIds || [],
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
        that._requestSubscribeThenAnalyze();
      }).catch(function () {
        that._requestSubscribeThenAnalyze();
      });
    } else {
      this._requestSubscribeThenAnalyze();
    }
  },

  /**
   * 跳过性格信息，先请求订阅再分析
   */
  onPersonalitySkip: function () {
    this._requestSubscribeThenAnalyze();
  },

  /**
   * 请求订阅消息授权，无论用户是否同意都继续分析
   */
  _requestSubscribeThenAnalyze: function () {
    var that = this;

    // 请求订阅消息
    wx.requestSubscribeMessage({
      tmplIds: ['MotJahkp5DN6k66kLHps__sxR25G7yjDfUdCQ4jAj6M'],
      success: function (res) {
        // 检查用户对模板的授权状态
        var accepted = res['MotJahkp5DN6k66kLHps__sxR25G7yjDfUdCQ4jAj6M'] === 'accept';
        console.log('订阅消息授权:', accepted ? '已同意' : '已拒绝');
      },
      fail: function (err) {
        console.warn('订阅消息请求失败:', err);
      },
      complete: function () {
        // 无论订阅结果如何，都继续分析
        that._startAnalysis();
      },
    });
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
