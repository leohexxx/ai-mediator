/**
 * OCR 识别云函数 (v2)
 * 职责: 接收 base64 图片 → 优先腾讯云 OCR → 降级 OCR.space → 返回文字
 *
 * 腾讯云 OCR（通过 wx-server-sdk cloud.openapi）:
 *   更精准的中文识别，需要 CloudBase 环境开通 OCR 能力
 *   如果未开通会自动降级到 OCR.space
 */

var cloud = require('wx-server-sdk');
var https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 腾讯云 OCR — 通用印刷体识别
 * 通过 wx-server-sdk 内置的 openapi，无需额外配置
 */
function ocrViaTencentCloud(base64Image) {
  return cloud.openapi.ocr.printedText({
    imageBase64: base64Image,
  }).then(function (res) {
    // 返回格式: { items: [{text: 'xxx', ...}], text: '完整文本' }
    if (res && res.data && res.data.items) {
      var texts = res.data.items.map(function (item) { return item.text || ''; });
      var fullText = texts.join('');
      if (fullText.trim()) {
        return fullText;
      }
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
            if (text.trim()) {
              resolve(text);
            } else {
              reject(new Error('OCR 未识别到文字'));
            }
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
 * 云函数入口
 */
exports.main = async function (event, context) {
  try {
    var base64Image = event.base64;
    var mimeType = event.mimeType || 'image/jpeg';

    if (!base64Image) {
      return { code: -1, data: null, message: '缺少图片数据' };
    }

    // 移除可能的 data URL 前缀
    if (base64Image.indexOf('base64,') !== -1) {
      base64Image = base64Image.split('base64,')[1];
    }

    console.log('OCR 开始, 图片 base64 长度:', base64Image.length);

    var text = '';
    var method = '';

    // 优先: 腾讯云 OCR（更精准的中文识别）
    try {
      text = await ocrViaTencentCloud(base64Image);
      method = 'tencent_cloud';
      console.log('腾讯云 OCR 成功, 文字长度:', text.length);
    } catch (tencentErr) {
      console.warn('腾讯云 OCR 失败, 降级 OCR.space:', tencentErr.message);
      // 降级: OCR.space
      try {
        text = await ocrViaOcrSpace(base64Image, mimeType);
        method = 'ocrspace';
        console.log('OCR.space 成功, 文字长度:', text.length);
      } catch (ocrSpaceErr) {
        console.error('OCR.space 也失败:', ocrSpaceErr.message);
        return { code: -1, data: null, message: 'OCR 识别失败: ' + ocrSpaceErr.message };
      }
    }

    return {
      code: 0,
      data: { text: text, method: method },
      message: 'ok',
    };
  } catch (error) {
    console.error('ocrImage error:', error.message);
    return { code: -1, data: null, message: error.message || 'OCR 识别失败' };
  }
};
