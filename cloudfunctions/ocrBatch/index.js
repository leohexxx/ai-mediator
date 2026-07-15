/**
 * OCR 批量识别云函数 (v1)
 * 职责: 接收多帧 base64 图片 → 并行 OCR → 返回合并文本
 *
 * 设计目的: 视频抽帧后，将 8-12 帧合并为一次云函数调用，大幅减少冷启动次数。
 * 每帧先尝试腾讯云 OCR，失败则降级 OCR.space。
 * 帧间通过 Promise.all 并发控制（MAX_CONCURRENT=4）加速。
 */

var cloud = require('wx-server-sdk');
var https = require('https');

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
 * OCR.space 免费 API（降级方案）
 */
function ocrViaOcrSpace(base64Image, mimeType) {
  var API_KEY = 'K86789598888957';
  var ext = (mimeType || 'image/jpeg').split('/')[1] || 'jpg';
  var payload =
    'isOverlayRequired=false' +
    '&base64Image=' + encodeURIComponent('data:' + (mimeType || 'image/jpeg') + ';base64,' + base64Image) +
    '&OCREngine=2' +
    '&filetype=' + ext.toUpperCase() +
    '&language=chs';

  return new Promise(function (resolve, reject) {
    var options = {
      hostname: 'api.ocr.space',
      port: 443,
      path: '/parse/image',
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload, 'utf8'),
      },
      timeout: 30000,
    };

    var req = https.request(options, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        var responseText = Buffer.concat(chunks).toString('utf8');
        try {
          var data = JSON.parse(responseText);
          if (data.ParsedResults && data.ParsedResults.length > 0) {
            var text = data.ParsedResults[0].ParsedText || '';
            if (text.trim()) resolve(text);
            else reject(new Error('OCR 未识别到文字'));
          } else if (data.ErrorMessage) {
            reject(new Error('OCR 错误: ' + data.ErrorMessage));
          } else {
            reject(new Error('OCR 返回为空'));
          }
        } catch (e) {
          reject(new Error('解析 OCR 返回失败: ' + e.message));
        }
      });
    });

    req.on('error', function (err) { reject(err); });
    req.on('timeout', function () { req.destroy(); reject(new Error('OCR 请求超时')); });
    req.write(payload);
    req.end();
  });
}

/**
 * 单帧 OCR（先腾讯云，降级 OCR.space）
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
    try {
      text = await ocrViaOcrSpace(cleaned, mimeType);
      method = 'ocrspace';
    } catch (ocrSpaceErr) {
      return { timeIndex: timeIndex, text: '', method: 'failed', error: ocrSpaceErr.message };
    }
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
