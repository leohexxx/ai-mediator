// ═══════════════════════════════════════════════
// OCR 服务 — 从图片提取文字
// 支持 OCR.space / 腾讯OCR
// ═══════════════════════════════════════════════
var https = require('https');
var config = require('../config');

/**
 * 通过 OCR.space 免费 API 识别图片
 */
function ocrViaOcrSpace(base64Image) {
  var API_KEY = config.ocr.ocrSpaceKey;
  if (!API_KEY) throw new Error('OCR_SPACE_API_KEY not configured');
  var payload = 'isOverlayRequired=false&base64Image=' + encodeURIComponent('data:image/jpeg;base64,' + base64Image) +
    '&OCREngine=2&filetype=JPG&language=chs';

  return new Promise(function (resolve, reject) {
    var options = {
      hostname: 'api.ocr.space', port: 443, path: '/parse/image',
      method: 'POST', timeout: 30000,
      headers: { 'apikey': API_KEY, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) },
    };
    var req = https.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try {
          var data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.ParsedResults && data.ParsedResults.length > 0) {
            resolve(data.ParsedResults[0].ParsedText || '');
          } else if (data.ErrorMessage) {
            reject(new Error('OCR error: ' + data.ErrorMessage));
          } else { reject(new Error('OCR returned empty')); }
        } catch (e) { reject(new Error('OCR parse failed: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function () { req.destroy(); reject(new Error('OCR timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * 批量并行 OCR 多张图片
 * @param {string[]} base64List - base64 图片数组
 * @returns {Promise<string[]>} 识别文本数组
 */
async function mapLimit(items, concurrency, mapper) {
  var results = new Array(items.length);
  var nextIndex = 0;
  var workerCount = Math.min(Math.max(concurrency || 1, 1), items.length);
  async function worker() {
    while (nextIndex < items.length) {
      var index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  var workers = [];
  for (var i = 0; i < workerCount; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

async function batchOcr(base64List) {
  return mapLimit(base64List, config.ocr.maxConcurrent, function (b64) {
    return ocrViaOcrSpace(b64).catch(function (e) {
      console.warn('[OCR] single image failed:', e.message);
      return '';
    });
  });
}

module.exports = { ocrViaOcrSpace: ocrViaOcrSpace, batchOcr: batchOcr, mapLimit: mapLimit };
