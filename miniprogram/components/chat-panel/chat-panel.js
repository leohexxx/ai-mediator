// ═══════════════════════════════════════════════
// chat-panel 组件 — 双方共享的服务端持久化追问面板。
// 客户端只调用私有 CloudRun API，不再直接读写 messages 集合。
// ═══════════════════════════════════════════════

var chatService = require('../../services/chat');

Component({
  properties: {
    /** 案例 ID */
    caseId: {
      type: String,
      value: '',
    },
    /** 分析数据 */
    analysis: {
      type: Object,
      value: null,
    },
  },

  data: {
    /** 聊天消息列表 */
    messages: [],
    /** 输入框内容 */
    inputText: '',
    /** 是否正在流式输出 */
    streaming: false,
    /** 滚动位置 */
    scrollTop: 0,
    /** 会话 ID */
    sessionId: '',
    /** 当前流式文本 */
    streamingText: '',
    /** 是否已加载历史 */
    historyLoaded: false,
    activeJobId: '',
  },

  lifetimes: {
    attached: function () {
      this.loadHistory();
    },
  },

  observers: {
    caseId: function (caseId) {
      if (caseId && !this.data.historyLoaded) this.loadHistory();
    },
  },

  methods: {
    /**
     * 输入框事件
     */
    onInput: function (e) {
      this.setData({ inputText: e.detail.value });
    },

    /**
     * 发送消息（纯文本追问）
     */
    onSend: function () {
      var text = this.data.inputText.trim();
      if (!text || this.data.streaming) return;

      var that = this;

      // 添加用户消息
      var messages = this.data.messages.concat([{
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      }]);

      this.setData({
        messages: messages,
        inputText: '',
        streaming: true,
        streamingText: '思考中...',
      });

      this.scrollToBottom();

      var tempSessionId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
      that.setData({ sessionId: tempSessionId, activeJobId: tempSessionId });

      chatService.sendMessage({
        caseId: that.data.caseId,
        analysisId: that.data.analysis && that.data.analysis._id,
        message: text,
        jobId: tempSessionId,
      }).then(function (res) {
        var data = res.data || {};
        if (data.status === 'canceled') {
          that.setData({ streaming: false, streamingText: '', activeJobId: '' });
          return;
        }
        var nextMessages = that.data.messages.concat([{
          role: 'assistant', content: data.reply || '', timestamp: new Date().toISOString(), streaming: false,
        }]);
        that.setData({ messages: nextMessages, streaming: false, streamingText: '', activeJobId: '' });
        that.scrollToBottom();
      }).catch(function (err) {
          console.warn('追问云函数调用异常:', err);
          that.setData({ streaming: false, streamingText: '', activeJobId: '' });
          wx.showToast({ title: '追问失败，请重试', icon: 'none' });
      });
    },

    onCancelSend: function () {
      var that = this;
      if (!this.data.activeJobId) return;
      chatService.cancelMessage(this.data.activeJobId).then(function () {
        that.setData({ streaming: false, streamingText: '', activeJobId: '' });
        wx.showToast({ title: '已打断回答', icon: 'none' });
      }).catch(function (error) {
        if (error && error.errorCode === 'CHAT_ALREADY_COMPLETED') that.loadHistory();
        else wx.showToast({ title: '打断失败', icon: 'none' });
      });
    },

    loadHistory: function () {
      var that = this;
      if (!this.data.caseId || this.data.historyLoaded) return;
      chatService.getHistory(this.data.caseId).then(function (result) {
        var history = result.data && result.data.messages || [];
        that.setData({
          messages: history.map(function (item) { return { role: item.role, content: item.content, timestamp: item.createdAt }; }),
          historyLoaded: true,
        });
        that.scrollToBottom();
      }).catch(function () {});
    },

    /**
     * 滚动到底部
     */
    scrollToBottom: function () {
      var that = this;
      setTimeout(function () {
        that.setData({ scrollTop: 99999 });
      }, 100);
    },
  },
});
