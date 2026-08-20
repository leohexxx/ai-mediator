// ═══════════════════════════════════════════════
// OCR 预览+编辑页（P1）
// ═══════════════════════════════════════════════

Page({
  data: {
    /** 案例 ID */
    caseId: '',
    /** 解析后的消息 */
    parsedMessages: [],
    ocrBlocks: [],
    /** 原始文本 */
    rawText: '',
    /** 是否正在提交 */
    submitting: false,
  },

  onLoad: function (options) {
    // 从上一页传递的解析结果
    var pages = getCurrentPages();
    var prevPage = pages[pages.length - 2];

    if (prevPage && prevPage.data) {
      var blocks = (prevPage.data.ocrBlocks || []).map(function (block) {
        return {
          speaker: block.speakerHint === 'self' ? '我' : block.speakerHint === 'other' ? '对方' : '系统',
          content: block.text || '',
          confidence: block.confidence || 0,
          lowConfidence: Number(block.confidence) < 88,
        };
      });
      var parsedMessages = prevPage.data.parsedMessages || [];
      if (!parsedMessages.length) parsedMessages = blocks;
      this.setData({
        caseId: options.caseId || '',
        rawText: prevPage.data.chatText || '',
        parsedMessages: parsedMessages,
        ocrBlocks: blocks,
      });
    }
  },

  /**
   * 编辑说话人名字
   */
  onSpeakerEdit: function (e) {
    var index = e.currentTarget.dataset.index;
    var value = e.detail.value;
    var messages = this.data.parsedMessages.slice();
    if (messages[index]) {
      messages[index].speaker = value;
      this.setData({ parsedMessages: messages });
    }
  },

  /**
   * 编辑消息内容
   */
  onContentEdit: function (e) {
    var index = e.currentTarget.dataset.index;
    var value = e.detail.value;
    var messages = this.data.parsedMessages.slice();
    if (messages[index]) {
      messages[index].content = value;
      this.setData({ parsedMessages: messages });
    }
  },

  /**
   * 删除消息
   */
  onDeleteMessage: function (e) {
    var index = e.currentTarget.dataset.index;
    var messages = this.data.parsedMessages.slice();
    messages.splice(index, 1);
    this.setData({ parsedMessages: messages });

    wx.showToast({ title: '已删除', icon: 'success' });
  },

  /**
   * 确认提交
   */
  onConfirm: function () {
    var pages = getCurrentPages();
    var prevPage = pages[pages.length - 2];

    if (prevPage) {
      // 将编辑后的消息转回文本
      var editedText = this.data.parsedMessages
        .map(function (m) {
          var time = m.timestamp ? '[' + m.timestamp + '] ' : '';
          return time + m.speaker + ': ' + m.content;
        })
        .join('\n');

      prevPage.setData({
        chatText: editedText,
        parsedMessages: this.data.parsedMessages,
        ocrBlocks: this.data.parsedMessages.map(function (message) {
          return { text: message.content, confidence: message.confidence, speakerHint: message.speaker === '我' ? 'self' : message.speaker === '对方' ? 'other' : 'system' };
        }),
        ocrConfirmed: true,
      });
      if (prevPage._saveDraft) prevPage._saveDraft();
    }

    wx.navigateBack();
  },
});
