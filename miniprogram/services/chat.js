// ═══════════════════════════════════════════════
// 追问服务层 - chatWithAnalysis 调用 + messages watch
// ═══════════════════════════════════════════════

var cloudUtil = require('../utils/cloud');

/**
 * 发送追问消息（流式返回）
 * @param {Object} params
 * @param {string} params.caseId
 * @param {string} params.message
 * @param {string} [params.sessionId]
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function sendMessage(params) {
  return cloudUtil.callFunction('chatWithAnalysis', {
    caseId: params.caseId,
    message: params.message,
    sessionId: params.sessionId || '',
  });
}

/**
 * 监听流式消息
 * @param {string} sessionId - 会话 ID
 * @param {function(Object): void} onUpdate - 更新回调，参数为 chunks 数组
 * @param {function(): void} onDone - 完成回调
 * @returns {{close: function(): void}}
 */
function watchMessages(sessionId, onUpdate, onDone) {
  var db = cloudUtil.getDatabase();

  try {
    var watcher = db.collection('messages')
      .where({ _id: sessionId })
      .watch({
        onChange: function (snapshot) {
          if (snapshot.docs && snapshot.docs.length > 0) {
            var doc = snapshot.docs[0];

            if (onUpdate) {
              onUpdate(doc.chunks || []);
            }

            if (doc.status === 'done') {
              if (watcher && watcher.close) {
                watcher.close();
              }
              if (onDone) {
                onDone(doc.fullText || '');
              }
            }
          }
        },
        onError: function (err) {
          console.error('watch messages error:', err);
        },
      });

    return {
      close: function () {
        if (watcher && watcher.close) {
          watcher.close();
        }
      },
    };
  } catch (err) {
    // 降级为轮询
    console.warn('watch messages 降级为轮询');
    var polling = true;

    var timer = setInterval(function () {
      if (!polling) return;

      db.collection('messages')
        .where({ _id: sessionId })
        .get({
          success: function (res) {
            if (res.data && res.data.length > 0) {
              var doc = res.data[0];

              if (onUpdate) {
                onUpdate(doc.chunks || []);
              }

              if (doc.status === 'done') {
                polling = false;
                if (onDone) {
                  onDone(doc.fullText || '');
                }
              }
            }
          },
        });
    }, 1000);

    return {
      close: function () {
        polling = false;
        clearInterval(timer);
      },
    };
  }
}

module.exports = {
  sendMessage: sendMessage,
  watchMessages: watchMessages,
};
