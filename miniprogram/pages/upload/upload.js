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
    });
  },

  /**
   * 从视频中提取关键帧并 OCR 识别聊天文字
   * @param {string} videoPath 本地视频路径
   * @param {number} duration 视频时长（秒）
   * @param {Promise} uploadPromise 视频上传 Promise
   */
  _extractAndOcrVideoFrames: function (videoPath, duration, uploadPromise) {
    var that = this;

    // 均匀采样 2 帧（头尾各一，速度优先）
    var totalFrames = Math.min(2, duration);
    var frameTimes = [];
    if (totalFrames === 2) {
      frameTimes = [Math.round(duration * 0.3), Math.round(duration * 0.7)];
    } else {
      frameTimes = [Math.round(duration * 0.5)];
    }

    var frameBase64List = [];
    var fileIds = [];
    var frameIndex = 0;

    // 视频上传放到后台，不阻塞
    uploadPromise.then(function (fid) { fileIds.push(fid); }).catch(function () {});

    // ═══ 阶段 1: 快速抽帧 ═══
    var decoder = wx.createVideoDecoder();

    decoder.on('start', function () {
      wx.showLoading({ title: '抽帧中 0/' + totalFrames, mask: true });
      processNextFrame();
    });

    decoder.on('stop', function () {
      decoder.remove();
      wx.showLoading({ title: '抽帧完成，开始识别...', mask: true });
      // ═══ 阶段 2: 批量 OCR ═══
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
              wx.showLoading({ title: '抽帧中 ' + frameIndex + '/' + totalFrames, mask: true });
              processNextFrame();
            });
        } else {
          frameIndex++;
          wx.showLoading({ title: '抽帧中 ' + frameIndex + '/' + totalFrames, mask: true });
          processNextFrame();
        }
      } catch (e) {
        frameIndex++;
        processNextFrame();
      }
    });

    function processNextFrame() {
      if (frameIndex >= totalFrames) {
        decoder.stop();
        return;
      }
      try {
        decoder.seek({ position: frameTimes[frameIndex] / 1000 });
      } catch (e) {
        frameIndex++;
        processNextFrame();
      }
    }

    // 启动解码器（旧版基础库可能不支持，降级为纯上传）
    try {
      decoder.source = videoPath;
      decoder.start();
    } catch (e) {
      wx.hideLoading();
      that._videoComplete(fileIds, [], Date.now());
    }
  },

  /**
   * 批量 OCR 已抽取的视频帧（并行加速）
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

    // 全部帧并行 OCR
    var promises = frameBase64List.map(function (item, index) {
      return evidenceService.ocrImageBase64(item.base64).then(function (ocrResult) {
        if (ocrResult.code === 0 && ocrResult.data && ocrResult.data.text) {
          var text = ocrResult.data.text.trim();
          if (text) {
            var sec = frameTimes[item.timeIndex];
            var m = Math.floor(sec / 60);
            var s = sec % 60;
            return '[视频 ' + m + ':' + (s < 10 ? '0' : '') + s + ']\n' + text;
          }
        }
        return null;
      }).catch(function () { return null; });
    });

    var doneCount = 0;
    promises.forEach(function (p) {
      p.then(function () {
        doneCount++;
        wx.showLoading({ title: '识别中 ' + doneCount + '/' + frameBase64List.length, mask: true });
      });
    });

    Promise.all(promises).then(function (results) {
      wx.hideLoading();
      var frameTexts = results.filter(function (r) { return r !== null; });
      that._videoComplete(fileIds, frameTexts, totalStart);
    });
  },

  /**
   * 视频处理完成，汇总结果
   */
  _videoComplete: function (fileIds, frameTexts, startTime) {
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    var combinedText = frameTexts.join('\n\n');
    if (!combinedText.trim()) {
      combinedText = '[视频抽帧未识别到文字。建议截取聊天截图上传，或直接粘贴文本。]';
    }

    this.setData({
      ocrProcessing: false,
      selectedImageCount: 1,
      ocrProgress: { current: 1, total: 1 },
      chatText: combinedText,
      uploadedFileIds: fileIds,
    });

    wx.showToast({
      title: frameTexts.length > 0 ? '提取 ' + frameTexts.length + ' 帧文字，' + elapsed + 's' : '未提取到文字',
      icon: frameTexts.length > 0 ? 'success' : 'none',
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
          that._startAnalysis();
        }).catch(function () {
          that._startAnalysis();
        });
      });
    } else {
      that._requestSubscribe(function () {
        that._startAnalysis();
      });
    }
  },

  /**
   * 跳过性格信息，先请求订阅再分析
   */
  onPersonalitySkip: function () {
    var that = this;
    that._requestSubscribe(function () {
      that._startAnalysis();
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
   * 开始分析（后台异步），跳转到首页等待推送通知
   */
  _startAnalysis: function () {
    var that = this;
    this.setData({ showPersonalityModal: false });

    // 触发分析（不等待结果，云函数后台跑完会发订阅消息推送）
    analysisService.analyzeCase(this.data.caseId).then(function (analysisRes) {
      if (analysisRes.code === 0) {
        console.log('分析已启动, analysisId:', analysisRes.data && analysisRes.data.analysisId);
      } else {
        console.warn('分析启动返回非预期:', analysisRes.message);
      }
    }).catch(function (err) {
      console.warn('分析启动调用异常:', err);
    });

    // 立刻跳转到报告页（报告页会显示"分析中"等待态）
    wx.redirectTo({
      url: '/pages/report/report?caseId=' + that.data.caseId + '&analyzing=1',
    });
  },
});
