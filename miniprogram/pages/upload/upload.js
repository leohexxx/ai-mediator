// ═══════════════════════════════════════════════
// 上传聊天记录页 (V3) — 批次证据、OCR校对与分析方式分离
// ═══════════════════════════════════════════════

var evidenceService = require('../../services/evidence');
var analysisService = require('../../services/analysis');
var caseService = require('../../services/case');
var storage = require('../../utils/storage');

Page({
  data: {
    caseId: '',
    role: 'party_a',
    mode: 'single',
    supplement: false,  // 是否为补充内容模式
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
    sourceHashes: [],
    perceptualHashes: [],
    ocrBlocks: [],
    ocrConfirmed: false,
    ocrError: '',
    evidenceRevision: null,
    pendingEvidenceKey: '',
    pendingAnalysisKey: '',
    pendingOcrJobId: '',
    pendingOcrFileIds: [],
    // 累计图片（支持分批追加）
    allTempFilePaths: [],
    // 视频
    videoPath: '',
    videoContext: null,

    // 证据保存后的分析方式面板（沿用字段名以兼容旧状态）
    showPersonalityModal: false,
    personalityA: null,
    personalityB: null,
    canEditPersonalityA: true,
    canEditPersonalityB: true,
    personalityLabelA: '发起方的沟通偏好',
    personalityLabelB: '受邀方的沟通偏好',
    // 分析视角决定是否把可选沟通偏好送入模型；分析深度独立决定模型预算。
    analysisPerspective: 'evidence',
    // 深度模式（Pro 模型，更深入但更慢）
    deepMode: false,
    // 视频帧 OCR 的离屏 canvas 缓存
    _ocrCanvas: null,
  },

  onLoad: function (options) {
    var caseId = options.caseId || '';
    var draft = storage.getJSON('evidence_draft_' + caseId, null);
    this.setData({
      caseId: caseId,
      role: options.role || 'party_a',
      mode: options.mode || 'single',
      supplement: options.supplement === '1',
      chatText: draft && draft.chatText || '',
      selectedImageCount: draft && draft.selectedImageCount || 0,
      uploadedFileIds: draft && draft.uploadedFileIds || [],
      sourceHashes: draft && draft.sourceHashes || [],
      perceptualHashes: draft && draft.perceptualHashes || [],
      ocrBlocks: draft && draft.ocrBlocks || [],
      ocrConfirmed: draft && draft.ocrConfirmed === true,
      pendingEvidenceKey: draft && draft.pendingEvidenceKey || '',
      pendingOcrJobId: draft && draft.pendingOcrJobId || '',
      pendingOcrFileIds: draft && draft.pendingOcrFileIds || [],
      uploadMode: draft && draft.chatText ? 'album' : '',
      showGuide: !(draft && draft.chatText),
      canEditPersonalityA: options.mode === 'single' || (options.role || 'party_a') === 'party_a',
      canEditPersonalityB: options.mode === 'single' || (options.role || 'party_a') === 'party_b',
      analysisPerspective: options.perspective === 'communication' ? 'communication' : 'evidence',
    });
    this._loadPersonality();
    if (draft && draft.pendingOcrJobId) this._resumePendingOcrJob();
  },

  /** 资料只作为沟通偏好参考，读取后回填到分析前的可选面板。 */
  _loadPersonality: function () {
    var that = this;
    if (!this.data.caseId) return;
    caseService.getCaseDetail(this.data.caseId, { summaryOnly: true }).then(function (res) {
      var caseData = res && res.data && res.data.caseData;
      if (!caseData) return;
      var isSingle = caseData.mode === 'single';
      var currentRole = res.data.role || that.data.role;
      that.setData({
        mode: caseData.mode || that.data.mode,
        role: currentRole,
        personalityA: caseData.party_a && caseData.party_a.personality || null,
        personalityB: caseData.party_b && caseData.party_b.personality || null,
        canEditPersonalityA: isSingle || currentRole === 'party_a',
        canEditPersonalityB: isSingle || currentRole === 'party_b',
      });
    }).catch(function () {
      // 不阻断证据上传；性格资料始终是可选项。
    });
  },

  _saveDraft: function () {
    storage.setJSON('evidence_draft_' + this.data.caseId, {
      chatText: this.data.chatText,
      selectedImageCount: this.data.selectedImageCount,
      uploadedFileIds: this.data.uploadedFileIds || [],
      sourceHashes: this.data.sourceHashes || [],
      perceptualHashes: this.data.perceptualHashes || [],
      ocrBlocks: this.data.ocrBlocks || [],
      ocrConfirmed: this.data.ocrConfirmed === true,
      pendingEvidenceKey: this.data.pendingEvidenceKey || '',
      pendingOcrJobId: this.data.pendingOcrJobId || '',
      pendingOcrFileIds: this.data.pendingOcrFileIds || [],
    });
  },

  _clearDraft: function () {
    storage.remove('evidence_draft_' + this.data.caseId);
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
    if (that.data.selectedImageCount >= 100) {
      wx.showToast({ title: '每个案例最多100张截图', icon: 'none' });
      return;
    }

    // ═══ 新增：首次进入提示字数限制 ═══
    if (!that.data._shownTextLimitTip) {
      that.setData({ _shownTextLimitTip: true });
      wx.showToast({
        title: '提示：文字较多时可提取关键信息缩短分析时间',
        icon: 'none',
        duration: 3000,
      });
    }
    // ═══════════════════════════════════

    evidenceService.chooseMedia(Math.min(9, 100 - that.data.selectedImageCount)).then(function (result) {
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
    if (that.data.selectedImageCount >= 100) {
      wx.showToast({ title: '每个案例最多100张截图', icon: 'none' });
      return;
    }

    evidenceService.chooseMedia(Math.min(9, 100 - that.data.selectedImageCount)).then(function (result) {
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
      ocrError: '',
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
      },
      { exact: that.data.sourceHashes || [], perceptual: that.data.perceptualHashes || [] },
      function (jobId, fileIds) {
        that.setData({ pendingOcrJobId: jobId, pendingOcrFileIds: fileIds || [] });
        that._saveDraft();
      }
    ).then(function (ocrResult) {
      that._applyOcrResult(ocrResult, imageCount, existingCount);
    }).catch(function (err) {
      that._handleOcrError(err);
    });
  },

  _applyOcrResult: function (ocrResult, imageCount, existingCount) {
    wx.hideLoading();
    var extractedText = ocrResult.text || '';
    var oldText = this.data.chatText;
    var combinedText = oldText ? oldText + '\n\n--- 追加截图 ---\n\n' + extractedText : extractedText;
    var acceptedCount = ocrResult.acceptedCount != null ? ocrResult.acceptedCount : imageCount;
    var totalCount = existingCount + acceptedCount;
    this.setData({
      ocrProcessing: false,
      ocrProgress: { current: imageCount, total: imageCount },
      ocrError: '',
      chatText: combinedText,
      selectedImageCount: totalCount,
      uploadedFileIds: (this.data.uploadedFileIds || []).concat(ocrResult.fileIds || []),
      sourceHashes: (this.data.sourceHashes || []).concat(ocrResult.sourceHashes || []),
      perceptualHashes: (this.data.perceptualHashes || []).concat(ocrResult.perceptualHashes || []),
      ocrBlocks: (this.data.ocrBlocks || []).concat(ocrResult.ocrBlocks || []),
      ocrConfirmed: false,
      pendingOcrJobId: '',
      pendingOcrFileIds: [],
    });
    this._saveDraft();
    if (extractedText.trim()) {
      var duplicateTip = ocrResult.duplicateCount ? '，跳过重复' + ocrResult.duplicateCount + '张' : '';
      wx.showToast({ title: '已识别' + totalCount + '张' + duplicateTip, icon: 'none' });
    } else {
      wx.showToast({ title: '该批未识别到文字', icon: 'none' });
    }
  },

  _handleOcrError: function (err) {
    wx.hideLoading();
    var errorCode = (err && err.errorCode) || 'OCR_REQUEST_FAILED';
    var errorMessage = (err && (err.message || err.errMsg)) || '请求未到达识别服务';
    var errorSummary = errorCode + '：' + String(errorMessage).slice(0, 80);
    console.error('OCR 失败:', { errorCode: errorCode, message: errorMessage, statusCode: err && err.statusCode });
    this.setData({ ocrProcessing: false, ocrError: errorSummary });
    this._saveDraft();
    wx.showModal({
      title: '图片识别暂未完成',
      content: errorSummary + '\n任务记录已经保留，重新进入此页面会继续查询。',
      showCancel: false,
    });
  },

  _resumePendingOcrJob: function () {
    var that = this;
    var jobId = this.data.pendingOcrJobId;
    var fileIds = this.data.pendingOcrFileIds || [];
    if (!jobId || !fileIds.length) return;
    var existingCount = this.data.selectedImageCount || 0;
    this.setData({
      uploadMode: 'album', showGuide: false, ocrProcessing: true,
      ocrProgress: { current: 0, total: fileIds.length }, ocrError: '',
    });
    wx.showLoading({ title: '恢复识别任务...', mask: true });
    evidenceService.resumeImagesAndOCR(jobId, fileIds, function (current, total) {
      that.setData({ ocrProgress: { current: current, total: total } });
      wx.showLoading({ title: '识别中 ' + current + '/' + total + '...', mask: true });
    }).then(function (ocrResult) {
      that._applyOcrResult(ocrResult, fileIds.length, existingCount);
    }).catch(function (error) {
      that._handleOcrError(error);
    });
  },

  /**
   * 长文本保留原文；V3 由 CloudRun 先提取结构化事实，再只选择必要片段进入模型。
   */
  _handleOversizedText: function (text, fileIds, count) {
    var that = this;
    wx.showModal({
      title: '文字内容较多',
      content: '识别出约 ' + text.length + ' 字。V3 会保存原始证据，并由服务端先做规则提取、脱敏和片段筛选，以缩短分析时间。',
      showCancel: false,
      success: function () {
        that.setData({
          ocrProcessing: false,
          chatText: text,
          uploadedFileIds: fileIds,
          selectedImageCount: count,
        });
      },
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

        // 先上传原视频到云存储
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
   * 固定间隔抽帧：短视频每 2s、中视频每 3s、长视频每 5s，最多 15 帧
   */
  _extractAndOcrVideoFrames: function (videoPath, duration, uploadPromise) {
    var that = this;

    // 优化: 固定间隔覆盖整段视频，帧数上限从 8 提到 15，间隔缩短保证短视频也有足够帧
    var interval;
    if (duration <= 30) interval = 2;         // ≤30s: 每2s
    else if (duration <= 120) interval = 3;   // 30s-2min: 每3s
    else interval = 5;                         // >2min: 每5s

    var maxFrames = 15;
    var rawCount = Math.floor(duration / interval);
    var totalFrames = Math.min(rawCount, maxFrames);
    var frameTimes = [];
    if (totalFrames > 0) {
      var step = duration / totalFrames; // 均匀分布
      for (var i = 0; i < totalFrames; i++) {
        frameTimes.push(Math.round(step * (i + 0.5))); // 每段中间
      }
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
   * 批量 OCR 已抽取的视频帧 — 分批发送避免超 6MB 限制
   * 每批最多 5 帧，或总数据 < 4MB 时全部一批
   */
  _ocrFrameBatch: function (frameBase64List, frameTimes, fileIds) {
    var that = this;
    var totalStart = Date.now();

    if (frameBase64List.length === 0) {
      wx.hideLoading();
      that._videoComplete(fileIds, [], totalStart);
      return;
    }

    // 估算总大小，决定是否分批
    var totalSize = 0;
    frameBase64List.forEach(function (f) { totalSize += f.base64.length; });
    console.log('[视频] 帧数:', frameBase64List.length, '总base64:', (totalSize / 1024 / 1024).toFixed(1), 'MB');

    var BATCH_SIZE = 5;
    if (totalSize < 4 * 1024 * 1024) BATCH_SIZE = frameBase64List.length; // <4MB 一批搞定

    var allResults = { successCount: 0, totalFrames: frameBase64List.length, combinedText: '' };

    function processBatch(startIdx) {
      if (startIdx >= frameBase64List.length) {
        wx.hideLoading();
        if (allResults.combinedText.trim()) {
          wx.showToast({ title: '识别 ' + allResults.successCount + '/' + allResults.totalFrames + ' 帧', icon: 'success' });
          that._videoComplete(fileIds, [allResults.combinedText], totalStart);
        } else {
          wx.showToast({ title: '未识别到文字', icon: 'none' });
          that._videoComplete(fileIds, [], totalStart);
        }
        return;
      }

      var endIdx = Math.min(startIdx + BATCH_SIZE, frameBase64List.length);
      var batchFrames = [];
      for (var i = startIdx; i < endIdx; i++) {
        batchFrames.push({
          base64: frameBase64List[i].base64,
          timeIndex: frameTimes[frameBase64List[i].timeIndex],
        });
      }

      wx.showLoading({ title: '识别中 ' + (startIdx + 1) + '-' + endIdx + '/' + frameBase64List.length, mask: true });

      evidenceService.ocrBatch(batchFrames, that.data.caseId).then(function (res) {
        if (res.code === 0 && res.data) {
          allResults.successCount += (res.data.successCount || 0);
          if (res.data.combinedText) {
            allResults.combinedText += (allResults.combinedText ? '\n\n' : '') + res.data.combinedText;
          }
        } else {
          console.warn('批次失败:', startIdx, '-', endIdx, res && res.message);
        }
        processBatch(endIdx);
      }).catch(function (err) {
        console.error('批次OCR失败', startIdx, '-', endIdx, ':',
          (err && (err.errMsg || err.message)) || err);
        processBatch(endIdx);
      });
    }

    processBatch(0);
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
   * 将视频帧数据转为 base64（通过离屏 Canvas — 缓存 canvas 实例）
   */
  _frameDataToBase64: function (frameData, width, height) {
    var that = this;
    return new Promise(function (resolve, reject) {
      try {
        // 复用页面级缓存 canvas（不反复创建销毁）
        var canvas = that._ocrCanvas;
        if (!canvas || canvas.width !== width || canvas.height !== height) {
          canvas = wx.createOffscreenCanvas({ type: '2d', width: width, height: height });
          that._ocrCanvas = canvas;
        }
        var ctx = canvas.getContext('2d');

        // 写像素数据
        var imageData = ctx.createImageData(width, height);
        imageData.data.set(frameData.data);
        ctx.putImageData(imageData, 0, 0);

        // 降低 quality 加速导出
        canvas.toDataURL({
          type: 'image/jpeg',
          quality: 0.5,
          success: function (res) {
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
    this._saveDraft();
  },

  onOpenOcrPreview: function () {
    wx.navigateTo({ url: '/pages/ocr-preview/ocr-preview?caseId=' + this.data.caseId });
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
    if (this.data.ocrBlocks && this.data.ocrBlocks.length && !this.data.ocrConfirmed) {
      wx.showToast({ title: '请先校对并确认OCR结果', icon: 'none' });
      this.onOpenOcrPreview();
      return;
    }

    this.setData({ submitting: true });
    if (!this.data.pendingEvidenceKey) {
      this.setData({ pendingEvidenceKey: 'evidence_' + this.data.caseId + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10) });
      this._saveDraft();
    }
    wx.showLoading({ title: '发送中...', mask: true });

    evidenceService.uploadEvidence({
      caseId: this.data.caseId,
      rawText: this.data.chatText,
      note: this.data.note,
      fileIds: this.data.uploadedFileIds || [],
      sourceHashes: this.data.sourceHashes || [],
      perceptualHashes: this.data.perceptualHashes || [],
      ocrBlocks: this.data.ocrBlocks || [],
      idempotencyKey: this.data.pendingEvidenceKey,
    }).then(function (res) {
      wx.hideLoading();

      if (res.code === 0 && res.data) {
        that.setData({ evidenceRevision: res.data.revision });
        that._clearDraft();
        wx.showToast({ title: '证据已保存', icon: 'success' });

        if (that.data.supplement) {
          // 补充内容模式：沿用当前分析方式，基于新证据版本开始分析
          that._startAnalysis(true);
        } else {
          // 普通模式：由用户先选分析视角，再选分析深度。
          that.setData({
            showPersonalityModal: true,
          });
        }
      } else {
        that.setData({ submitting: false });
        wx.showToast({ title: res.message || '发送失败', icon: 'none' });
      }
    }).catch(function (error) {
      wx.hideLoading();
      that.setData({ submitting: false });
      wx.showToast({ title: error && error.errorCode === 'EVIDENCE_LOCKED' ? '请先打断当前分析' : '发送失败，请重试', icon: 'none' });
    });
  },

  // ===== 分析视角与深度面板 =====

  onSelectPerspective: function (event) {
    var perspective = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.perspective;
    this.setData({ analysisPerspective: perspective === 'communication' ? 'communication' : 'evidence' });
  },

  /** 深度分析；沟通画像仅在用户主动选择时启用。 */
  onPersonalityConfirm: function () {
    var that = this;
    this.setData({ deepMode: true });
    that._requestSubscribe(function () { that._savePersonalityThenStart(); });
  },

  /** 快速分析。 */
  onPersonalitySkip: function () {
    var that = this;
    this.setData({ deepMode: false });
    that._requestSubscribe(function () { that._savePersonalityThenStart(); });
  },

  _savePersonalityThenStart: function () {
    var that = this;
    var picker = this.selectComponent('#personalityPicker');
    var profiles = picker ? picker.getData() : null;
    if (this.data.analysisPerspective !== 'communication' || !profiles || !(profiles.personalityA || profiles.personalityB)) {
      that._startAnalysis(false);
      return;
    }
    caseService.updatePersonality(this.data.caseId, profiles.personalityA, profiles.personalityB)
      .then(function (res) {
        var data = res && res.data || {};
        that.setData({
          personalityA: data.personalityA || profiles.personalityA || null,
          personalityB: data.personalityB || profiles.personalityB || null,
        });
      })
      .catch(function () {
        wx.showToast({ title: '沟通偏好未保存，将按默认方式分析', icon: 'none' });
      })
      .then(function () {
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
  onToggleDeepMode: function (e) {
    var hasValue = e && e.detail && typeof e.detail.value === 'boolean';
    this.setData({ deepMode: hasValue ? e.detail.value : !this.data.deepMode });
  },

  /**
   * 开始分析（等待云函数返回 analysisId 后再跳转，避免报告页竞态）
   * @param {boolean} [force=false] - 兼容旧调用签名，V3 不允许绕过分析锁
   */
  _startAnalysis: function (force) {
    var that = this;
    var deep = this.data.deepMode;
    this.setData({ showPersonalityModal: false });

    if (!this.data.pendingAnalysisKey) {
      this.setData({
        pendingAnalysisKey: 'analysis_' + this.data.caseId + '_' + this.data.role + '_r' + (this.data.evidenceRevision || 'latest') + '_p' + this.data.analysisPerspective,
      });
    }

    wx.showLoading({ title: '正在启动分析...', mask: true });

    // 等待 analyzeCase 返回（拿到 analysisId 后再跳转，避免报告页找不到分析记录）
    analysisService.analyzeCase(this.data.caseId, force === true, deep, {
      evidenceRevision: this.data.evidenceRevision,
      perspective: this.data.analysisPerspective,
      idempotencyKey: this.data.pendingAnalysisKey,
    }).then(function (analysisRes) {
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
        // 补充内容模式：返回报告页前，把新的 analysisId 传给报告页
        var pages = getCurrentPages();
        if (pages.length >= 2) {
          var prevPage = pages[pages.length - 2];
          prevPage._pendingSupplementRefresh = analysisId || true;
        }
        wx.navigateBack();
      } else {
        wx.redirectTo({ url: url });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.warn('分析启动调用异常:', err);
      that.setData({ submitting: false });
      if (err && err.errorCode === 'ANALYSIS_IN_PROGRESS') {
        wx.showToast({ title: '对方已启动分析', icon: 'none' });
        wx.redirectTo({ url: '/pages/report/report?caseId=' + that.data.caseId + '&analyzing=1' });
        return;
      }
      if (err && err.errorCode === 'EVIDENCE_REVISION_CHANGED') {
        wx.showToast({ title: '证据版本已变化，请重新进入', icon: 'none' });
        return;
      }
      wx.showToast({ title: (err && err.message) || '启动分析失败，请重试', icon: 'none' });
    });
  },
});
