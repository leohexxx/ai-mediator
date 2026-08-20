/**
 * OCR 批量识别云函数 (v1)
 * 职责: 接收多帧 base64 图片 → 并行 OCR → 返回合并文本
 *
 * 设计目的: 视频抽帧后，将 8-12 帧合并为一次云函数调用，大幅减少冷启动次数。
 * 每帧仅使用腾讯云 OCR，聊天截图不得发送到第三方 OCR 服务。
 * 帧间通过 Promise.all 并发控制（MAX_CONCURRENT=4）加速。
 */

var cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var MAX_CONCURRENT = 4; // 同时最多 4 帧 OCR

/**
 * 腾讯云 OCR — 通用印刷体识别
 */
function ocrViaTencentCloud(base64Image) {
  return cloud.openapi.ocr.printedText({
    imageBase64: base64Image,
  }).then(function (res) {
    if (res && res.data && res.data.items) {
      var texts = res.data.items.map(function (item) { return item.text || ''; });
      var fullText = texts.join('');
      if (fullText.trim()) return fullText;
    }
    throw new Error('腾讯云 OCR 返回为空');
  });
}

/**
 * 单帧 OCR（仅腾讯云）
 */
async function ocrSingleFrame(base64Image, mimeType, timeIndex) {
  var cleaned = base64Image;
  if (cleaned.indexOf('base64,') !== -1) {
    cleaned = cleaned.split('base64,')[1];
  }

  var text = '';
  var method = '';

  try {
    text = await ocrViaTencentCloud(cleaned);
    method = 'tencent_cloud';
  } catch (tencentErr) {
    return { timeIndex: timeIndex, text: '', method: 'failed', error: tencentErr.message };
  }

  return { timeIndex: timeIndex, text: text, method: method, error: null };
}

/**
 * 云函数入口
 */
exports.main = async function (event, context) {
  try {
    var frames = event.frames;
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return { code: -1, data: null, message: '缺少 frame 数据' };
    }

    var mimeType = event.mimeType || 'image/jpeg';
    var totalFrames = frames.length;
    console.log('[ocrBatch] 开始批量 OCR, 帧数:', totalFrames);

    // 诊断：检查每帧大小
    for (var di = 0; di < Math.min(frames.length, 3); di++) {
      var b64 = frames[di].base64 || '';
      console.log('[ocrBatch] 帧' + di + ' base64长度:', b64.length, '前缀:', b64.substring(0, 30));
    }

    var results = new Array(totalFrames);
    var completedCount = 0;

    // 分批并发: 每批 MAX_CONCURRENT 个帧同时 OCR
    for (var start = 0; start < totalFrames; start += MAX_CONCURRENT) {
      var batch = [];
      var batchIndices = [];
      for (var i = start; i < Math.min(start + MAX_CONCURRENT, totalFrames); i++) {
        batchIndices.push(i);
        batch.push(ocrSingleFrame(frames[i].base64, mimeType, frames[i].timeIndex));
      }

      var batchResults = await Promise.all(batch);
      for (var j = 0; j < batchResults.length; j++) {
        var idx = batchIndices[j];
        results[idx] = batchResults[j];
        if (batchResults[j].text) completedCount++;
      }
      console.log('[ocrBatch] 完成 ' + Math.min(start + MAX_CONCURRENT, totalFrames) + '/' + totalFrames + ' 帧');
    }

    // 按 timeIndex 排序并合并文本
    var sortedResults = results
      .filter(function (r) { return r && r.text; })
      .sort(function (a, b) { return a.timeIndex - b.timeIndex; });

    var combinedText = sortedResults.map(function (r) {
      var sec = r.timeIndex;
      var m = Math.floor(sec / 60);
      var s = sec % 60;
      var ts = '[视频 ' + m + ':' + (s < 10 ? '0' : '') + s + ']';
      return ts + '\n' + r.text;
    }).join('\n\n');

    var successCount = sortedResults.length;
    var failCount = totalFrames - successCount;

    // 诊断：输出失败帧的错误原因
    results.forEach(function(r, ri) {
      if (r && r.error) console.error('[ocrBatch] 帧' + ri + ' 失败:', r.method, r.error);
    });

    console.log('[ocrBatch] 完成: ' + successCount + ' 成功, ' + failCount + ' 失败');

    return {
      code: 0,
      data: {
        combinedText: combinedText,
        results: results,
        successCount: successCount,
        failCount: failCount,
        totalFrames: totalFrames,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('[ocrBatch] 错误:', error.message);
    return { code: -1, data: null, message: error.message || '批量OCR失败' };
  }
};
