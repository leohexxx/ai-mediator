// ═══════════════════════════════════════════════
// 上传证据页 — 三种上传方式
// ═══════════════════════════════════════════════

var evidenceService = require('../../services/evidence');
var authUtil = require('../../utils/auth');

Page({
  data: {
    /** 案例 ID */
    caseId: '',
    /** 当前用户角色 */
    role: '',
    /** 上传方式：choose_file / album / paste */
    uploadMode: '',
    /** 聊天记录文本 */
    chatText: '',
    /** 备注 */
    note: '',
    /** 是否正在提交 */
    submitting: false,
    /** 已选图片数量 */
    selectedImageCount: 0,
    /** 选择的文件名 */
    selectedFileName: '',
  },

  onLoad: function (options) {
    this.setData({
      caseId: options.caseId || '',
      role: options.role || 'party_a',
    });
  },

  /**
   * 方式一：选择聊天记录文件
   */
  onChooseMessageFile: function () {
    var that = this;
    evidenceService.chooseMessageFile().then(function (result) {
      that.setData({
        uploadMode: 'choose_file',
        chatText: result.content,
        selectedFileName: result.fileName,
      });
      wx.showToast({ title: '已读取 ' + result.fileName, icon: 'success' });
    }).catch(function (err) {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
      console.error('选择文件失败:', err);
      wx.showToast({ title: '选择文件失败', icon: 'none' });
    });
  },

  /**
   * 方式二：从相册选择截图
   */
  onChooseMedia: function () {
    var that = this;
    evidenceService.chooseMedia(9).then(function (result) {
      // TODO: 截图上传后需要 OCR 识别（P1 功能）
      // 当前 P0 版本：将截图信息记录，OCR 用 placeholder
      that.setData({
        uploadMode: 'album',
        selectedImageCount: result.tempFilePaths.length,
        chatText: '[截图OCR待实现] 已选择 ' + result.tempFilePaths.length + ' 张截图，OCR 功能将在后续版本中支持。请使用方式一或方式三上传聊天记录。',
      });
    }).catch(function (err) {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
      console.error('选择图片失败:', err);
    });
  },

  /**
   * 方式三：粘贴文本
   */
  onPasteText: function () {
    this.setData({ uploadMode: 'paste' });
  },

  /**
   * 文本输入
   */
  onTextInput: function (e) {
    this.setData({ chatText: e.detail.value });
  },

  /**
   * 备注输入
   */
  onNoteInput: function (e) {
    this.setData({ note: e.detail.value });
  },

  /**
   * 提交证据
   */
  onSubmit: function () {
    var that = this;

    if (this.data.submitting) return;

    if (!this.data.chatText || !this.data.chatText.trim()) {
      wx.showToast({ title: '请先上传或输入聊天记录', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    evidenceService.uploadEvidence({
      caseId: this.data.caseId,
      rawText: this.data.chatText,
      note: this.data.note,
    }).then(function (res) {
      that.setData({ submitting: false });

      if (res.code === 0 && res.data) {
        wx.showToast({ title: '提交成功', icon: 'success' });

        // 如果自动分析条件满足，跳转回详情页
        setTimeout(function () {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    }).catch(function (err) {
      console.error('提交证据失败:', err);
      that.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    });
  },
});
