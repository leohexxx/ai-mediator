// ═══════════════════════════════════════════════
// chatWithAnalysis 云函数
// 职责: 流式 LLM → 节流 200ms 批量写入 messages 集合
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var llm = require('./common/llm');

/**
 * 云函数入口
 * @param {Object} event
 * @param {string} event.caseId - 案例 ID
 * @param {string} event.message - 用户消息
 * @param {string} [event.sessionId] - 会话 ID（续传用）
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var caseId = event.caseId;
    var message = event.message;
    var sessionId = event.sessionId;

    if (!caseId) {
      return { code: -1, data: null, message: '缺少案例 ID' };
    }
    if (!message || !message.trim()) {
      return { code: -1, data: null, message: '请输入问题' };
    }

    // 获取案例和分析数据作为上下文
    var caseResult = await db.collection('cases').doc(caseId).get();
    var caseData = caseResult.data;

    if (!caseData) {
      return { code: -1, data: null, message: '案例不存在' };
    }

    // 权限校验
    if (caseData.party_a.openid !== openid && caseData.party_b.openid !== openid) {
      return { code: -1, data: null, message: '无权操作此案例' };
    }

    var analysisId = caseData.analysisId;
    if (!analysisId) {
      return { code: -1, data: null, message: '分析尚未完成，无法追问' };
    }

    // 获取分析报告
    var analysisResult = await db.collection('analyses').doc(analysisId).get();
    var analysisData = analysisResult.data;

    if (!analysisData) {
      return { code: -1, data: null, message: '分析报告不存在' };
    }

    // 构建上下文
    var contextObj = {
      coreConclusion: analysisData.coreConclusion,
      evidenceWeights: analysisData.evidenceWeights,
      emotionCurve: analysisData.emotionCurve,
      mediationStrategy: analysisData.mediationStrategy,
      detailedAnalysis: analysisData.detailedAnalysis,
      advice: analysisData.advice,
    };
    var contextStr = JSON.stringify(contextObj);

    var now = new Date().toISOString();

    // 获取或创建会话
    var sessionDoc;
    if (sessionId) {
      try {
        var existingResult = await db.collection('messages').doc(sessionId).get();
        sessionDoc = existingResult.data;
      } catch (_) {
        sessionDoc = null;
      }
    }

    if (!sessionDoc) {
      // 创建新会话
      var newSession = await db.collection('messages').add({
        data: {
          caseId: caseId,
          userId: openid,
          chunks: [],
          status: 'streaming',
          fullText: '',
          createdAt: now,
          updatedAt: now,
        },
      });
      sessionId = newSession._id;
      sessionDoc = { _id: sessionId, chunks: [] };
    }

    // 获取历史消息
    var existingChunks = sessionDoc.chunks || [];
    var history = [];

    // 构建历史消息（每轮对话：user + assistant）
    var fullExistingText = existingChunks.map(function (c) { return c.text; }).join('');
    if (fullExistingText) {
      history.push({ role: 'user', content: '[上轮问题]' });
      history.push({ role: 'assistant', content: fullExistingText });
    }

    // 流式接收 LLM 回答
    var chunkBuffer = '';
    var chunkOrder = existingChunks.length;
    var lastFlushTime = Date.now();
    var THROTTLE_MS = 200;
    var CHUNK_SIZE = 20;

    // 异步启动 LLM 调用（在后台运行，通过批量写入数据库来推送进度）
    // 先返回 sessionId 让客户端开始 watch
    var result = {
      code: 0,
      data: {
        sessionId: sessionId,
        status: 'streaming',
      },
      message: 'ok',
    };

    // 在后台进行 LLM 调用和流式写入
    setTimeout(async function () {
      try {
        var maxRetries = 2;
        var retryCount = 0;
        var llmSuccess = false;

        while (retryCount <= maxRetries && !llmSuccess) {
          try {
            await llm.chatWithAnalysis(
              contextStr,
              history,
              message,
              async function (chunk) {
                chunkBuffer += chunk;

                var now2 = Date.now();
                if (chunkBuffer.length >= CHUNK_SIZE || now2 - lastFlushTime >= THROTTLE_MS) {
                  var flushText = chunkBuffer;
                  chunkBuffer = '';

                  if (flushText) {
                    try {
                      await db.collection('messages').doc(sessionId).update({
                        data: {
                          chunks: db.command.push([{ text: flushText, order: chunkOrder }]),
                          updatedAt: new Date().toISOString(),
                        },
                      });
                      chunkOrder++;
                      lastFlushTime = Date.now();
                    } catch (updateErr) {
                      console.error('写入 chunk 失败:', updateErr);
                    }
                  }
                }
              }
            );

            llmSuccess = true;
          } catch (llmErr) {
            console.error('LLM 调用失败 (重试 ' + retryCount + '/' + maxRetries + '):', llmErr);
            retryCount++;
            if (retryCount > maxRetries) {
              throw llmErr;
            }
            await new Promise(function (resolve) { setTimeout(resolve, 2000); });
          }
        }

        // 刷新剩余缓冲区
        if (chunkBuffer) {
          await db.collection('messages').doc(sessionId).update({
            data: {
              chunks: db.command.push([{ text: chunkBuffer, order: chunkOrder }]),
              updatedAt: new Date().toISOString(),
            },
          });
          chunkOrder++;
        }

        // 获取完整文本并标记完成
        var finalDoc = await db.collection('messages').doc(sessionId).get();
        var finalChunks = finalDoc.data.chunks || [];
        var fullText = finalChunks.map(function (c) { return c.text; }).join('');

        await db.collection('messages').doc(sessionId).update({
          data: {
            status: 'done',
            fullText: fullText,
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error('chatWithAnalysis 流式处理失败:', err);
        // 标记失败
        try {
          await db.collection('messages').doc(sessionId).update({
            data: {
              status: 'done',
              fullText: '抱歉，AI 回答生成失败: ' + (err.message || '未知错误'),
              updatedAt: new Date().toISOString(),
            },
          });
        } catch (_) { /* ignore */ }
      }
    }, 100);

    return result;
  } catch (error) {
    console.error('chatWithAnalysis error:', error);
    return { code: -1, data: null, message: error.message || '追问失败' };
  }
};
