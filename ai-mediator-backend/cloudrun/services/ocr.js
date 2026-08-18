var crypto = require('crypto');
var sharp = require('sharp');
var config = require('../config');

var client = null;

function getTencentClient() {
  if (client) return client;
  if (!config.ocr.tencentSecretId || !config.ocr.tencentSecretKey) {
    throw new Error('TENCENT_OCR_SECRET_ID / TENCENT_OCR_SECRET_KEY not configured');
  }
  var tencentcloud = require('tencentcloud-sdk-nodejs-ocr');
  var OcrClient = tencentcloud.ocr.v20181119.Client;
  client = new OcrClient({
    credential: { secretId: config.ocr.tencentSecretId, secretKey: config.ocr.tencentSecretKey },
    region: config.ocr.region,
    profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com', reqTimeout: 30 } },
  });
  return client;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function differenceHash(buffer) {
  var pixels = await sharp(buffer).resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
  var bits = '';
  for (var row = 0; row < 8; row++) {
    for (var col = 0; col < 8; col++) {
      bits += pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? '1' : '0';
    }
  }
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

async function splitLongImage(buffer) {
  var metadata = await sharp(buffer).metadata();
  var width = metadata.width || 0;
  var height = metadata.height || 0;
  if (!width || !height) throw new Error('无法读取图片尺寸');
  var maxHeight = config.ocr.tileHeight;
  var overlap = Math.min(config.ocr.tileOverlap, Math.floor(maxHeight / 4));
  if (height <= maxHeight) return [{ buffer: buffer, top: 0, width: width, height: height }];
  var tiles = [];
  var top = 0;
  while (top < height) {
    var tileHeight = Math.min(maxHeight, height - top);
    var tile = await sharp(buffer).extract({ left: 0, top: top, width: width, height: tileHeight }).jpeg({ quality: 92 }).toBuffer();
    tiles.push({ buffer: tile, top: top, width: width, height: tileHeight });
    if (top + tileHeight >= height) break;
    top += tileHeight - overlap;
  }
  return tiles;
}

function blockTop(item) {
  if (item.ItemPolygon && Number.isFinite(item.ItemPolygon.Y)) return item.ItemPolygon.Y;
  var polygon = item.Polygon || [];
  if (!polygon.length) return 0;
  return Math.min.apply(null, polygon.map(function (point) { return Number(point.Y) || 0; }));
}

function blockCenterX(item) {
  if (item.ItemPolygon && Number.isFinite(item.ItemPolygon.X) && Number.isFinite(item.ItemPolygon.Width)) {
    return item.ItemPolygon.X + item.ItemPolygon.Width / 2;
  }
  var polygon = item.Polygon || [];
  if (!polygon.length) return 0;
  return polygon.reduce(function (sum, point) { return sum + (Number(point.X) || 0); }, 0) / polygon.length;
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, '').replace(/[，。！？、；：“”‘’]/g, '');
}

function inferSpeaker(centerX, width) {
  if (!width) return 'unknown';
  var ratio = centerX / width;
  if (ratio >= 0.58) return 'self';
  if (ratio <= 0.42) return 'other';
  return 'system';
}

function hammingDistance(left, right) {
  if (!left || !right || left.length !== right.length) return Infinity;
  var a = BigInt('0x' + left);
  var b = BigInt('0x' + right);
  var value = a ^ b;
  var distance = 0;
  while (value) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

function mergeBlocks(blocks) {
  var seen = {};
  return blocks.sort(function (a, b) { return a.top - b.top || a.left - b.left; }).filter(function (block) {
    var signature = normalizeText(block.text);
    if (!signature) return false;
    if (seen[signature] && Math.abs(seen[signature] - block.top) < 400) return false;
    seen[signature] = block.top;
    return true;
  });
}

async function recognizeTile(tile) {
  var response = await getTencentClient().GeneralAccurateOCR({
    ImageBase64: tile.buffer.toString('base64'),
    IsWords: false,
    EnableDetectSplit: true,
    EnableDetectText: true,
  });
  return (response.TextDetections || []).map(function (item) {
    var top = blockTop(item) + tile.top;
    var centerX = blockCenterX(item);
    return {
      text: item.DetectedText || '',
      confidence: Number(item.Confidence) || 0,
      top: top,
      left: item.ItemPolygon ? Number(item.ItemPolygon.X) || 0 : centerX,
      width: item.ItemPolygon ? Number(item.ItemPolygon.Width) || 0 : 0,
      height: item.ItemPolygon ? Number(item.ItemPolygon.Height) || 0 : 0,
      speakerHint: inferSpeaker(centerX, tile.width),
    };
  });
}

async function recognizeImage(base64Image) {
  var cleaned = String(base64Image || '').replace(/^data:image\/\w+;base64,/, '');
  var buffer = Buffer.from(cleaned, 'base64');
  if (!buffer.length) throw new Error('图片数据为空');
  if (buffer.length > config.ocr.maxImageBytes) throw new Error('单张图片超过大小限制');
  var exactHash = sha256(buffer);
  var perceptualHash = await differenceHash(buffer);
  var tiles = await splitLongImage(buffer);
  var tileResults = await mapLimit(tiles, Math.min(config.ocr.maxConcurrent, 2), recognizeTile);
  var blocks = mergeBlocks([].concat.apply([], tileResults));
  var text = blocks.map(function (block) { return block.text; }).join('\n');
  var avgConfidence = blocks.length
    ? blocks.reduce(function (sum, block) { return sum + block.confidence; }, 0) / blocks.length
    : 0;
  return {
    text: text,
    blocks: blocks,
    exactHash: exactHash,
    perceptualHash: perceptualHash,
    confidence: Math.round(avgConfidence * 100) / 100,
    lowConfidence: avgConfidence < config.ocr.lowConfidenceThreshold,
    tileCount: tiles.length,
  };
}

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

async function batchOcrDetailed(base64List, options) {
  options = options || {};
  var exactSeen = {};
  var perceptualSeen = [];
  (options.knownExactHashes || []).forEach(function (hash) { exactSeen[hash] = 'previous_batch'; });
  (options.knownPerceptualHashes || []).forEach(function (hash) { perceptualSeen.push({ hash: hash, index: 'previous_batch' }); });
  var results = await mapLimit(base64List, config.ocr.maxConcurrent, async function (base64, index) {
    try {
      var recognized = await recognizeImage(base64);
      if (exactSeen[recognized.exactHash] != null) {
        return Object.assign({}, recognized, { index: index, duplicate: true, duplicateReason: 'exact_hash', duplicateOf: exactSeen[recognized.exactHash] });
      }
      var nearDuplicate = perceptualSeen.find(function (item) {
        return hammingDistance(item.hash, recognized.perceptualHash) <= 2;
      });
      if (nearDuplicate) {
        return Object.assign({}, recognized, { index: index, duplicate: true, duplicateReason: 'perceptual_hash', duplicateOf: nearDuplicate.index });
      }
      exactSeen[recognized.exactHash] = index;
      perceptualSeen.push({ hash: recognized.perceptualHash, index: index });
      return Object.assign({}, recognized, { index: index, duplicate: false, duplicateOf: null });
    } catch (error) {
      return { index: index, text: '', blocks: [], error: error.message, duplicate: false };
    }
  });
  return results;
}

async function batchOcr(base64List) {
  var detailed = await batchOcrDetailed(base64List);
  return detailed.map(function (item) { return item.duplicate ? '' : item.text; });
}

module.exports = {
  recognizeImage: recognizeImage,
  batchOcrDetailed: batchOcrDetailed,
  batchOcr: batchOcr,
  mapLimit: mapLimit,
  sha256: sha256,
  differenceHash: differenceHash,
  splitLongImage: splitLongImage,
  mergeBlocks: mergeBlocks,
  inferSpeaker: inferSpeaker,
  hammingDistance: hammingDistance,
};
