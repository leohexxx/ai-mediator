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
    supplement: false,  // 是否为补充证据模式
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
    // 累计图片（支持分批追加）
    allTempFilePaths: [],
    // 视频
    videoPath: '',
    videoContext: null,

    // 性格弹窗
    showPersonalityModal: false,
    personalitySubmitted: false,
    // 深度模式（Pro 模型，更深入但更慢）
    deepMode: false,
  },

  onLoad: function (options) {
    this.setData({
      caseId: options.caseId || '',
      role: options.role || 'party_a',
      mode: options.mode || 'single',
      supplement: options.supplement === '1',
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
      if (err.message === 'cancel' || (err.errMsg && err.errMsg.indexOf('cancel') !== -1)) return;
      wx.showToast({ title: '选择文件失败', icon: 'none' });
    });
  },

  onChooseMedia: function () {
    var that = this;

    evidenceService.chooseMedia(9).then(function (result) {
      var imageCount = result.tempFilePaths.length;

      // 累加所有图片路径
      var allPaths = (that.data.allTempFilePaths || []).concat(result.tempFilePaths);
      that.setData({
        allTempFilePaths: allPaths,
      });

      that._processOcrBatch(result.tempFilePaths);
    }).catch(function (err) {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
      console.error('选择图片失败:', err);
    });
  },

  /**
   * 继续添加更多截图（超过9张时使用）
   */
  onContinueChooseMedia: function () {
    var that = this;

    evidenceService.chooseMedia(9).then(function (result) {
      var imageCount = result.tempFilePaths.length;

      // 累加图片路径
      var allPaths = (that.data.allTempFilePaths || []).concat(result.tempFilePaths);
      that.setData({
        allTempFilePaths: allPaths,
      });

      // 追加 OCR 识别新一批图片
      that._processOcrBatch(result.tempFilePaths);
    }).catch(function (err) {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
      console.error('继续添加图片失败:', err);
    });
  },

  /**
   * 批量处理图片 OCR（支持追加）
   */
  _processOcrBatch: function (tempFilePaths) {
    var that = this;
    var imageCount = tempFilePaths.length;
    var existingCount = that.data.selectedImageCount;

    // 显示选中状态
    that.setData({
      uploadMode: 'album',
      showGuide: false,
      ocrProcessing: true,
      ocrProgress: { current: 0, total: imageCount },
    });

    wx.showLoading({ title: '上传并识别中...', mask: true });

    // 上传图片 + OCR 识别
    evidenceService.uploadImagesAndOCR(
      tempFilePaths,
      that.data.caseId,
      function (current, total) {
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
      var oldText = that.data.chatText;
      // 追加到已有文本后
      var combinedText = oldText
        ? oldText + '\n\n--- 追加截图 ---\n\n' + extractedText
        : extractedText;
      var totalCount = existingCount + imageCount;
      var allFileIds = (that.data.uploadedFileIds || []).concat(ocrResult.fileIds || []);

      that.setData({
        ocrProcessing: false,
        ocrProgress: { current: imageCount, total: imageCount },
        chatText: combinedText,
        selectedImageCount: totalCount,
        uploadedFileIds: allFileIds,
      });

      if (extractedText.trim()) {
        wx.showToast({ title: '识别成功，共 ' + totalCount + ' 张', icon: 'success' });
      } else {
        wx.showToast({ title: '该批未识别到文字', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('OCR 失败:', err);

      that.setData({
        ocrProcessing: false,
        chatText: that.data.chatText || '[截图处理失败: ' + (err.message || '请重试') + '。您可以改用"直接粘贴文本"方式上传。]',
      });
      wx.showToast({ title: '识别失败，请重试', icon: 'none' });
    });
  },

  onPasteText: function () {
    this.setData({ uploadMode: 'paste', showGuide: false });
  },

  // ===== 视频/录屏上传 =====

  /**
   * 选择视频或录屏 — 抽帧 OCR + 上传云存储
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

        if (duration <= 0) {
          wx.showToast({ title: '无法读取视频时长，请重试', icon: 'none' });
          return;
        }

        that.setData({
          uploadMode: 'video',
          videoPath: videoPath,
          showGuide: false,
          ocrProcessing: true,
          selectedImageCount: 1,
          ocrProgress: { current: 0, total: 1 },
        });

        // 先上传原视频到云存储（作为证据附件）
        var uploadPromise = evidenceService.uploadVideoToCloud(videoPath, that.data.caseId);

        // 同时开始抽帧 OCR
        that._extractAndOcrVideoFrames(videoPath, duration, uploadPromise);
      },
      fail: function (err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
        wx.showModal({
          title: '视频选择失败',
          content: '请确认视频格式正确。支持常见视频格式（mp4、mov 等），建议录制竖屏聊天录屏。',
          showCancel: false,
        });
      },
    });
  },

  /**
   * 从视频中提取关键帧并 OCR 识别聊天文字
   * 固定间隔抽帧：短视频每 2s、中视频每 3s、长视频每 5s，最多 12 帧
   */
  _extractAndOcrVideoFrames: function (videoPath, duration, uploadPromise) {
    var that = this;

    // 固定间隔策略（覆盖整段视频）
    var interval;
    if (duration <= 60) interval = 3;        // ≤1min: 每3s（原2s，减少帧数提速）
    else if (duration <= 180) interval = 5;  // 1-3min: 每5s（原3s）
    else interval = 8;                        // >3min: 每8s（原5s）

    var maxFrames = 8;
    var rawCount = Math.floor(duration / interval);
    var totalFrames = Math.min(rawCount, maxFrames);
    var frameTimes = [];
    for (var i = 0; i < totalFrames; i++) {
      frameTimes.push(Math.round((i + 0.5) * interval)); // 取每段中间
    }

    var frameBase64List = [];
    var fileIds = [];
    var frameIndex = 0;

    // 视频上传放到后台
    uploadPromise.then(function (fid) { fileIds.push(fid); }).catch(function () {});

    // ═══ 阶段 1: 按期抽帧 ═══
    var decoder = wx.createVideoDecoder();

    decoder.on('start', function () {
      wx.showLoading({ title: '正在扫描视频 0/' + totalFrames, mask: true });
      processNextFrame();
    });

    decoder.on('stop', function () {
      decoder.remove();
      wx.showLoading({ title: '抽帧完成 ' + frameBase64List.length + ' 帧，开始识别...', mask: true });
      that._ocrFrameBatch(frameBase64List, frameTimes, fileIds);
    });

    decoder.on('seek', function () {
      try {
        var frameData = decoder.getFrameData();
        if (frameData && frameData.data) {
          that._frameDataToBase64(frameData, decoder.width, decoder.height)
            .then(function (base64) {
              frameBase64List.push({ base64: base64, timeIndex: frameIndex });
            })
            .catch(function () {})
            .finally(function () {
              frameIndex++;
              updateProgress();
              processNextFrame();
            });
        } else {
          frameIndex++;
          updateProgress();
          processNextFrame();
        }
      } catch (e) {
        frameIndex++;
        updateProgress();
        processNextFrame();
      }
    });

    function updateProgress() {
      if (frameIndex < totalFrames) {
        var sec = frameTimes[Math.min(frameIndex, totalFrames - 1)];
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        wx.showLoading({
          title: '正在扫描 ' + m + ':' + (s < 10 ? '0' : '') + s + '  ' + frameIndex + '/' + totalFrames,
          mask: true,
        });
      }
    }

    function processNextFrame() {
      if (frameIndex >= totalFrames) {
        decoder.stop();
        return;
      }
      try {
        decoder.seek({ position: frameTimes[frameIndex] });
      } catch (e) {
        frameIndex++;
        processNextFrame();
      }
    }

    // 启动解码器
    try {
      decoder.source = videoPath;
      decoder.start();
    } catch (e) {
      wx.hideLoading();
      that._videoComplete(fileIds, [], Date.now());
    }
  },

  /**
   * 批量 OCR 已抽取的视频帧 — 所有帧合并为一次云函数调用
   * 原方案各帧分别调用云函数（12次冷启动），现改为单次批量调用（大幅提速）
   */
  _ocrFrameBatch: function (frameBase64List, frameTimes, fileIds) {
    var that = this;
    var totalStart = Date.now();

    if (frameBase64List.length === 0) {
      wx.hideLoading();
      that._videoComplete(fileIds, [], totalStart);
      return;
    }

    wx.showLoading({ title: '识别中 0/' + frameBase64List.length, mask: true });

    // 构造批量请求: 所有帧的 base64 + 时间索引
    var frames = frameBase64List.map(function (item, index) {
      return {
        base64: item.base64,
        timeIndex: frameTimes[item.timeIndex],
      };
    });

    evidenceService.ocrBatch(frames).then(function (res) {
      wx.hideLoading();
      if (res.code === 0 && res.data) {
        var combinedText = res.data.combinedText || '';
        var successCount = res.data.successCount || 0;
        wx.showToast({
          title: successCount > 0 ? '识别 ' + successCount + '/' + frames.length + ' 帧' : '未识别到文字',
          icon: successCount > 0 ? 'success' : 'none',
        });
        that._videoComplete(fileIds, combinedText ? [combinedText] : [], totalStart);
      } else {
        wx.showToast({ title: res.message || '批量OCR失败', icon: 'none' });
        that._videoComplete(fileIds, [], totalStart);
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('批量OCR失败:', err);
      that._videoComplete(fileIds, [], totalStart);
    });
  },

  /**
   * 视频处理完成，汇总结果
   */
  _videoComplete: function (fileIds, frameTexts, startTime) {
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    var combinedText = frameTexts.join('\n\n');
    var textLen = combinedText.trim().length;
    if (!combinedText.trim()) {
      combinedText = '[视频抽帧全部失败。请尝试：1) 截取聊天截图上传；2) 直接粘贴聊天文本。]';
    }

    this.setData({
      ocrProcessing: false,
      selectedImageCount: 1,
      ocrProgress: { current: 1, total: 1 },
      chatText: combinedText,
      uploadedFileIds: fileIds,
    });

    wx.showToast({
      title: textLen > 0 ? '已提取 ' + textLen + ' 字，' + elapsed + 's' : '未提取到文字',
      icon: textLen > 0 ? 'success' : 'none',
    });
  },

  /**
   * 将视频帧数据转为 base64（通过离屏 Canvas）
   */
  _frameDataToBase64: function (frameData, width, height) {
    return new Promise(function (resolve, reject) {
      try {
        var canvas = wx.createOffscreenCanvas({
          type: '2d',
          width: width,
          height: height,
        });
        var ctx = canvas.getContext('2d');

        // 将 RGBA 像素数据画到 Canvas
        var clampedData = new Uint8ClampedArray(frameData.data);
        var imageData = ctx.createImageData(width, height);
        imageData.data.set(clampedData);
        ctx.putImageData(imageData, 0, 0);

        // 导出为图片
        canvas.toDataURL({
          type: 'image/jpeg',
          quality: 0.7,
          success: function (res) {
            // 去掉 data:image/jpeg;base64, 前缀
            var base64 = (res.data || '').replace(/^data:image\/\w+;base64,/, '');
            resolve(base64);
          },
          fail: reject,
        });
      } catch (e) {
        reject(e);
      }
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
      supplement: this.data.supplement,
    }).then(function (res) {
      wx.hideLoading();

      if (res.code === 0 && res.data) {
        wx.showToast({ title: '提交成功', icon: 'success' });

        if (that.data.supplement) {
          // 补充证据模式：跳过性格弹窗，直接开始分析（force=true）
          that._startAnalysis(true);
        } else {
          // 普通模式：弹出性格信息弹窗
          that.setData({
            showPersonalityModal: true,
          });
        }
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

    // 先触发订阅消息（必须在 tap 手势内同步调用，不能异步延迟）
    if (picker && picker.hasAnyData()) {
      var data = picker.getData();
      // 请求订阅后，再异步保存性格信息 + 开始分析
      that._requestSubscribe(function () {
        caseService.updatePersonality(
          that.data.caseId,
          data.personalityA,
          data.personalityB
        ).then(function () {
          that._startAnalysis(false);
        }).catch(function () {
          that._startAnalysis(false);
        });
      });
    } else {
      that._requestSubscribe(function () {
        that._startAnalysis(false);
      });
    }
  },

  /**
   * 跳过性格信息，先请求订阅再分析
   */
  onPersonalitySkip: function () {
    var that = this;
    that._requestSubscribe(function () {
      that._startAnalysis(false);
    });
  },

  /**
   * 请求订阅消息授权，完成后执行 callback（无论用户是否同意）
   * 注意：必须由用户 tap 手势同步触发，不能放在异步回调后
   */
  _requestSubscribe: function (callback) {
    wx.requestSubscribeMessage({
      tmplIds: ['MotJahkp5DN6k66kLHps__sxR25G7yjDfUdCQ4jAj6M'],
      success: function (res) {
        var accepted = res['MotJahkp5DN6k66kLHps__sxR25G7yjDfUdCQ4jAj6M'] === 'accept';
        console.log('订阅消息授权:', accepted ? '已同意' : '已拒绝');
      },
      fail: function (err) {
        console.warn('订阅消息请求失败:', err);
      },
      complete: function () {
        if (callback) callback();
      },
    });
  },

  /**
   * @deprecated 使用 _requestSubscribe(callback) 替代
   */
  _requestSubscribeThenAnalyze: function () {
    var that = this;
    this._requestSubscribe(function () {
      that._startAnalysis();
    });
  },

  /**
   * 切换深度模式
   */
  onToggleDeepMode: function () {
    this.setData({ deepMode: !this.data.deepMode });
  },

  /**
   * 开始分析（等待云函数返回 analysisId 后再跳转，避免报告页竞态）
   * @param {boolean} [force=false] - 强制重新分析（补充证据时使用）
   */
  _startAnalysis: function (force) {
    var that = this;
    var deep = this.data.deepMode;
    this.setData({ showPersonalityModal: false });

    wx.showLoading({ title: '正在启动分析...', mask: true });

    // 等待 analyzeCase 返回（拿到 analysisId 后再跳转，避免报告页找不到分析记录）
    analysisService.analyzeCase(this.data.caseId, force === true, deep).then(function (analysisRes) {
      wx.hideLoading();

      var analysisId = '';
      if (analysisRes.code === 0 && analysisRes.data) {
        analysisId = analysisRes.data.analysisId || '';
        console.log('分析已启动, analysisId:', analysisId);
      } else {
        console.warn('分析启动返回非预期:', analysisRes && analysisRes.message);
      }

      // 跳转到报告页，带上 analysisId 避免竞态
      var url = '/pages/report/report?caseId=' + that.data.caseId + '&analyzing=1';
      if (analysisId) url += '&analysisId=' + analysisId;

      if (that.data.supplement) {
        // 补充证据模式：返回报告页（原页面还在栈中）
        wx.navigateBack();
      } else {
        wx.redirectTo({ url: url });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.warn('分析启动调用异常:', err);

      // 降级：即使调用失败也跳转报告页（让轮询兜底）
      var fallbackUrl = '/pages/report/report?caseId=' + that.data.caseId + '&analyzing=1';
      if (that.data.supplement) {
        wx.navigateBack();
      } else {
        wx.redirectTo({ url: fallbackUrl });
      }
    });
  },
});
