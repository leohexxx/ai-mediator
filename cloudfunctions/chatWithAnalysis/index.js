// ═══════════════════════════════════════════════
// chatWithAnalysis 云函数 (v2)
// 职责: 接收客户端预生成的 sessionId，await LLM 流式写入 messages 集合
//
// 流水线设计（解决容器回收问题）：
//   客户端预生成 sessionId → 客户端在 DB 创建 session 文档 →
//   客户端 watch session → 调用本云函数（传 sessionId） →
//   本函数 await LLM 调用（直接流式写入 DB，不 setTimeout） →
//   LLM 完成 → 本函数返回（此时客户端 watch 已收到全部数据）
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var llm = require('./common/llm');

/**
 * 下载云存储图片并 OCR
 * @param {string} fileID - 云存储文件 ID
 * @returns {Promise<string>} OCR 识别文本
 */
async function ocrImageFromCloud(fileID) {
  try {
    // 获取临时下载链接
    var tempResult = await cloud.getTempFileURL({
      fileList: [fileID],
    });
    if (!tempResult.fileList || tempResult.fileList.length === 0) {
      return '';
    }
    var tempURL = tempResult.fileList[0].tempFileURL;
    if (!tempURL) return '';

    // 下载图片
    var https = require('https');
    var imageBuffer = await new Promise(function (resolve, reject) {
      https.get(tempURL, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          resolve(Buffer.concat(chunks));
        });
      }).on('error', reject);
    });

    var base64Image = imageBuffer.toString('base64');

    // 调用腾讯云 OCR
    try {
      var ocrResult = await cloud.openapi.ocr.printedText({
        imageBase64: base64Image,
      });
      if (ocrResult && ocrResult.data && ocrResult.data.items) {
        var texts = ocrResult.data.items.map(function (item) { return item.text || ''; });
        var fullText = texts.join('');
        if (fullText.trim()) return fullText;
      }
    } catch (_) {}
    return '';
  } catch (err) {
    console.error('OCR 图片失败:', fileID, err.message);
    return '';
  }
}

/**
 * 云函数入口
 * @param {Object} event
 * @param {string} event.caseId - 案例 ID
 * @param {string} event.message - 用户消息
 * @param {string} [event.sessionId] - 会话 ID（客户端预生成，若为空则本函数创建）
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  // 启动日志: 打印 LLM 配置（掩码 API key，防止泄露）
  try {
    var cfg = llm.getConfig();
    var maskedKey = cfg.apiKey ? '***' + cfg.apiKey.slice(-6) : '(empty)';
    console.log('[chatWithAnalysis] LLM config: provider=' + cfg.provider + ' model=' + cfg.model + ' baseUrl=' + cfg.baseUrl + ' key=' + maskedKey);
  } catch (e) {
    console.warn('[chatWithAnalysis] 无法读取 LLM 配置:', e.message);
  }

  try {
    var caseId = event.caseId;
    var message = event.message;
    var sessionId = event.sessionId;
    var imageFileIds = event.imageFileIds || [];

    if (!caseId) {
      return { code: -1, data: null, message: '缺少案例 ID' };
    }
    if ((!message || !message.trim()) && imageFileIds.length === 0) {
      return { code: -1, data: null, message: '请输入问题或上传图片' };
    }

    // 图片 OCR：下载并识别用户上传的图片
    var imageOcrText = '';
    if (imageFileIds.length > 0) {
      console.log('[chatWithAnalysis] 处理 ' + imageFileIds.length + ' 张图片 OCR');
      var ocrResults = [];
      for (var imgIdx = 0; imgIdx < imageFileIds.length; imgIdx++) {
        var ocrText = await ocrImageFromCloud(imageFileIds[imgIdx]);
        if (ocrText) {
          ocrResults.push('[用户上传图片' + (imgIdx + 1) + ']\n' + ocrText);
        }
      }
      if (ocrResults.length > 0) {
        imageOcrText = '\n\n## 用户上传的图片内容\n' + ocrResults.join('\n\n');
        console.log('[chatWithAnalysis] 图片OCR完成, 共 ' + ocrResults.length + '/' + imageFileIds.length + ' 张识别成功');
      }
    }

    // 将图片OCR文本追加到消息中
    var enhancedMessage = message || '[图片]';
    if (imageOcrText) {
      enhancedMessage = enhancedMessage + '\n\n（用户同时上传了以下图片，图片中的文字内容如下：）\n' + imageOcrText;
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

    // 获取或创建会话（兼容旧客户端：未传 sessionId 时创建）
    if (!sessionId) {
      // 旧客户端兼容分支：本函数创建 session
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
    }

    // 获取历史消息（如果 session 已存在 chunks）
    var sessionDoc;
    try {
      var existingResult = await db.collection('messages').doc(sessionId).get();
      sessionDoc = existingResult.data;
    } catch (_) {
      sessionDoc = null;
    }

    // 如果 session 是新客户端创建但未传完整数据，先初始化
    if (!sessionDoc) {
      await db.collection('messages').add({
        data: {
          _id: sessionId,
          caseId: caseId,
          userId: openid,
          chunks: [],
          status: 'streaming',
          fullText: '',
          createdAt: now,
          updatedAt: now,
        },
      });
      sessionDoc = { _id: sessionId, chunks: [] };
    }

    var existingChunks = sessionDoc.chunks || [];
    var history = [];

    var fullExistingText = existingChunks.map(function (c) { return c.text; }).join('');
    if (fullExistingText) {
      history.push({ role: 'user', content: '[上轮问题]' });
      history.push({ role: 'assistant', content: fullExistingText });
    }

    // ++++++++++++++++++++++++++++++++++++++++++++++++++
    // 流式接收 LLM 回答（直接 await，不 setTimeout）
    // 客户端已先创建了 session 并 watch，实时接收 chunks
    // 本函数会阻塞直到 LLM 完成，但客户端已通过 watch 收到流
    // ++++++++++++++++++++++++++++++++++++++++++++++++++
    var chunkBuffer = '';
    var chunkOrder = existingChunks.length;
    var lastFlushTime = Date.now();
    var THROTTLE_MS = 200;
    var CHUNK_SIZE = 20;

    try {
      var maxRetries = 2;
      var retryCount = 0;
      var llmSuccess = false;

      while (retryCount <= maxRetries && !llmSuccess) {
        try {
          await llm.chatWithAnalysis(
            contextStr,
            history,
            enhancedMessage,
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

      return { code: 0, data: { sessionId: sessionId, fullText: fullText }, message: 'ok' };
    } catch (err) {
      console.error('chatWithAnalysis LLM 处理失败:', err);
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
      return { code: -1, data: null, message: err.message || '追问处理失败' };
    }
  } catch (error) {
    console.error('chatWithAnalysis error:', error);
    return { code: -1, data: null, message: error.message || '追问失败' };
  }
};
