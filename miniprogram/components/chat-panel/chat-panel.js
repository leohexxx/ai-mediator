// ═══════════════════════════════════════════════
// chat-panel 组件 — 聊天追问面板（微信气泡风格 + 流式渲染）
//
// 流水线设计（解决云函数容器回收问题）：
//   1. 客户端预生成 sessionId
//   2. 客户端在 DB 中创建 session 文档
//   3. 客户端 watch session 文档（实时监听流）
//   4. 客户端调用云函数（传 sessionId）
//   5. 云函数 await LLM 调用（不 setTimeout，不走 fire-and-forget）
//   6. LLM 流式写入 DB → watch 实时推送到 UI
// ═══════════════════════════════════════════════

var chatService = require('../../services/chat');
var cloudUtil = require('../../utils/cloud');

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
    /** 待发送图片 */
    pendingImages: [],
  },

  methods: {
    /**
     * 选择图片（从相册）
     */
    onChooseImage: function () {
      var that = this;
      wx.chooseMedia({
        count: 9,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: function (res) {
          var newImages = res.tempFiles.map(function (f) {
            return { tempFilePath: f.tempFilePath, size: f.size };
          });
          var existing = that.data.pendingImages || [];
          var allImages = existing.concat(newImages);
          that.setData({ pendingImages: allImages });
        },
        fail: function (err) {
          if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        },
      });
    },

    /**
     * 移除待发送图片
     */
    onRemoveImage: function (e) {
      var index = e.currentTarget.dataset.index;
      var images = this.data.pendingImages || [];
      images.splice(index, 1);
      this.setData({ pendingImages: images });
    },

    /**
     * 输入框事件
     */
    onInput: function (e) {
      this.setData({ inputText: e.detail.value });
    },

    /**
     * 发送消息（支持文字+图片）
     */
    onSend: function () {
      var text = this.data.inputText.trim();
      var images = this.data.pendingImages || [];
      var hasContent = text || images.length > 0;
      if (!hasContent || this.data.streaming) return;

      var that = this;

      // 先上传图片到云存储（如有）
      var uploadImagesPromise = Promise.resolve([]);
      if (images.length > 0) {
        wx.showLoading({ title: '上传图片中...', mask: true });
        var uploadTasks = images.map(function (img, idx) {
          var timestamp = Date.now();
          var random = Math.random().toString(36).substring(2, 8);
          var cloudPath = 'chat/' + that.data.caseId + '/' + timestamp + '_' + random + '_' + idx + '.jpg';
          return cloudUtil.uploadFile(cloudPath, img.tempFilePath).then(function (res) {
            return res.fileID;
          });
        });
        uploadImagesPromise = Promise.all(uploadTasks);
      }

      uploadImagesPromise.then(function (fileIds) {
        wx.hideLoading();

        // 添加用户消息（文字+图片预览）
        var userContent = text;
        var messages = that.data.messages.concat([{
          role: 'user',
          content: userContent || '[图片]',
          timestamp: new Date().toISOString(),
          imageCount: images.length,
        }]);

        that.setData({
          messages: messages,
          inputText: '',
          pendingImages: [],
          streaming: true,
          streamingText: '思考中...',
        });

        that.scrollToBottom();

        // 预生成 sessionId
        var tempSessionId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);

        // 在 DB 中创建 session 文档
        var db = wx.cloud.database();
        db.collection('messages').add({
          data: {
            _id: tempSessionId,
            caseId: that.data.caseId,
            chunks: [],
            status: 'streaming',
            fullText: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          success: function () {
            // 开始 watch session
            that.data.sessionId = tempSessionId;
            that._msgWatcher = chatService.watchMessages(
              tempSessionId,
              function (chunks) {
                var fullText = '';
                for (var i = 0; i < chunks.length; i++) {
                  fullText += chunks[i].text;
                }
                var msgs = that.data.messages;
                var lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.streaming !== false) {
                  msgs[msgs.length - 1] = {
                    role: 'assistant',
                    content: fullText,
                    timestamp: lastMsg.timestamp,
                    streaming: true,
                  };
                } else {
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

            // 调用云函数（传 sessionId + imageFileIds）
            chatService.sendMessage({
              caseId: that.data.caseId,
              message: text || '[图片]',
              sessionId: tempSessionId,
              imageFileIds: fileIds,
            }).then(function (res) {
              if (res.code === 0) {
                that.setData({ sessionId: tempSessionId });
              } else {
                console.warn('追问云函数返回异常:', res.message);
              }
            }).catch(function (err) {
              console.warn('追问云函数调用异常:', err);
            });
          },
          fail: function (err) {
            console.error('创建会话失败:', err);
            that.setData({ streaming: false, streamingText: '' });
            wx.showToast({ title: '创建会话失败，请重试', icon: 'none' });
          },
        });
      }).catch(function (err) {
        wx.hideLoading();
        console.error('图片上传失败:', err);
        wx.showToast({ title: '图片上传失败，请重试', icon: 'none' });
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
