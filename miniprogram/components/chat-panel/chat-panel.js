// ═══════════════════════════════════════════════
// chat-panel 组件 — 聊天追问面板（微信气泡风格 + 流式渲染）
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
  },

  methods: {
    /**
     * 输入框事件
     */
    onInput: function (e) {
      this.setData({ inputText: e.detail.value });
    },

    /**
     * 发送消息
     */
    onSend: function () {
      var text = this.data.inputText.trim();
      if (!text || this.data.streaming) return;

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

      var that = this;

      // 调用云函数
      chatService.sendMessage({
        caseId: this.data.caseId,
        message: text,
        sessionId: this.data.sessionId,
      }).then(function (res) {
        if (res.code === 0 && res.data) {
          var sessionId = res.data.sessionId;
          that.setData({ sessionId: sessionId, streamingText: '' });

          // 监听流式消息
          that._msgWatcher = chatService.watchMessages(
            sessionId,
            function (chunks) {
              // 拼接所有 chunks 的 text
              var fullText = '';
              for (var i = 0; i < chunks.length; i++) {
                fullText += chunks[i].text;
              }

              // 更新或添加 AI 消息
              var msgs = that.data.messages;
              var lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.streaming !== false) {
                // 更新最后一条 AI 消息
                msgs[msgs.length - 1] = {
                  role: 'assistant',
                  content: fullText,
                  timestamp: lastMsg.timestamp,
                  streaming: true,
                };
              } else {
                // 添加新的 AI 消息
                msgs.push({
                  role: 'assistant',
                  content: fullText,
                  timestamp: new Date().toISOString(),
                  streaming: true,
                });
              }

              that.setData({ messages: msgs, streamingText: fullText });
              that.scrollToBottom();
            },
            function (fullText) {
              // 流式完成
              var msgs = that.data.messages;
              var lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
              if (lastMsg && lastMsg.role === 'assistant') {
                msgs[msgs.length - 1] = {
                  role: 'assistant',
                  content: fullText,
                  timestamp: lastMsg.timestamp,
                  streaming: false,
                };
              }
              that.setData({
                messages: msgs,
                streaming: false,
                streamingText: '',
              });
              if (that._msgWatcher) {
                that._msgWatcher.close();
                that._msgWatcher = null;
              }
            }
          );
        } else {
          wx.showToast({ title: res.message || '发送失败', icon: 'none' });
          that.setData({ streaming: false, streamingText: '' });
        }
      }).catch(function (err) {
        console.error('发送追问失败:', err);
        that.setData({ streaming: false, streamingText: '' });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      });
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
