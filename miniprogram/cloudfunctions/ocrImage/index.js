// ═══════════════════════════════════════════════
// ocrImage 云函数 — 从截图提取文字
// 职责: 接收 base64 图片 → OCR 识别 → 返回文字
// 前端用 wx.getFileSystemManager().readFileSync(path, 'base64') 转好再传
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
var https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 使用 OCR.space 免费 API
 * 注意: apikey 必须放在 header 中（body 里的 apikey 已被弃用）
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
      timeout: 50000,
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
            reject(new Error('OCR 返回为空: ' + responseText.substring(0, 200)));
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
 * @param {Object} event
 * @param {string} event.base64 - 图片 base64 编码（不含 data:image/... 前缀）
 * @param {string} [event.mimeType] - MIME 类型，默认 image/jpeg
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

    var text = await ocrViaOcrSpace(base64Image, mimeType);

    console.log('OCR 完成, 文字长度:', text.length);

    return {
      code: 0,
      data: {
        text: text,
        method: 'ocrspace',
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('ocrImage error:', error.message);
    return { code: -1, data: null, message: error.message || 'OCR 识别失败' };
  }
};
