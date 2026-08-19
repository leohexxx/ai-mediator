var db = require('./db');
var ocr = require('./ocr');
var qwenVision = require('./qwenVision');
var evidenceStorage = require('./evidenceStorage');
var metrics = require('./metrics');

async function assertLease(jobId, leaseOwner) {
  var result = await db.collection('ocr_jobs').doc(jobId).get();
  var job = result.data;
  if (!job || !job.job || job.job.leaseOwner !== leaseOwner || job.status !== 'running') {
    var error = new Error('OCR任务租约已失效');
    error.code = 'OCR_LEASE_LOST';
    throw error;
  }
  return job;
}

function isDuplicate(exactHash, perceptualHash, exactSeen, perceptualSeen) {
  if (exactSeen[exactHash] != null) return { reason: 'exact_hash', duplicateOf: exactSeen[exactHash] };
  for (var i = 0; i < perceptualSeen.length; i++) {
    if (ocr.hammingDistance(perceptualSeen[i].hash, perceptualHash) <= 2) {
      return { reason: 'perceptual_hash', duplicateOf: perceptualSeen[i].index };
    }
  }
  return null;
}

async function processImage(base64, index, exactSeen, perceptualSeen) {
  var buffer = Buffer.from(base64, 'base64');
  var exactHash = ocr.sha256(buffer);
  var perceptualHash = await ocr.differenceHash(buffer);
  var duplicate = isDuplicate(exactHash, perceptualHash, exactSeen, perceptualSeen);
  if (duplicate) {
    return {
      index: index, text: '', blocks: [], exactHash: exactHash, perceptualHash: perceptualHash,
      duplicate: true, duplicateReason: duplicate.reason, duplicateOf: duplicate.duplicateOf,
    };
  }

  var result;
  var provider = 'qwen';
  try {
    result = await qwenVision.recognizeImage(base64);
  } catch (error) {
    provider = 'tencent_fallback';
    console.warn('[OcrJob] Qwen failed; using Tencent OCR fallback:', error.message);
    result = await ocr.recognizeImage(base64);
  }
  exactSeen[exactHash] = index;
  perceptualSeen.push({ hash: perceptualHash, index: index });
  return {
    index: index,
    text: result.text || '',
    blocks: result.blocks || [],
    exactHash: exactHash,
    perceptualHash: perceptualHash,
    confidence: result.confidence == null ? 90 : result.confidence,
    lowConfidence: result.lowConfidence === true,
    duplicate: false,
    duplicateOf: null,
    provider: provider,
  };
}

async function run(jobId, options) {
  options = options || {};
  var job = await assertLease(jobId, options.leaseOwner);
  var images = await evidenceStorage.loadCaseEvidenceImages(job.fileIds || [], job.caseId);
  var exactSeen = {};
  var perceptualSeen = [];
  (job.knownExactHashes || []).forEach(function (hash) { exactSeen[hash] = 'previous_batch'; });
  (job.knownPerceptualHashes || []).forEach(function (hash) { perceptualSeen.push({ hash: hash, index: 'previous_batch' }); });
  var detailed = [];
  for (var i = 0; i < images.length; i++) {
    var item = await processImage(images[i].base64, i, exactSeen, perceptualSeen);
    detailed.push(item);
    await assertLease(jobId, options.leaseOwner);
    await db.collection('ocr_jobs').doc(jobId).update({ data: {
      progress: { current: i + 1, total: images.length, message: '正在识别第' + (i + 1) + '张截图' },
      updatedAt: new Date().toISOString(),
    } });
  }
  var accepted = detailed.filter(function (item) { return !item.duplicate && !item.error; });
  var mergedText = accepted.map(function (item, index) {
    return item.text + '\n\n--- 截图 ' + (index + 1) + ' 结束 ---';
  }).join('\n\n');
  var now = new Date().toISOString();
  await assertLease(jobId, options.leaseOwner);
  await db.collection('ocr_jobs').doc(jobId).update({ data: {
    status: 'completed',
    result: {
      text: mergedText,
      images: detailed,
      acceptedCount: accepted.length,
      duplicateCount: detailed.filter(function (item) { return item.duplicate; }).length,
      failedCount: detailed.filter(function (item) { return !!item.error; }).length,
    },
    progress: { current: images.length, total: images.length, message: '识别完成' },
    completedAt: now,
    'job.leaseOwner': null,
    'job.leaseUntil': null,
    updatedAt: now,
  } });
  metrics.increment('ocr_images_completed', accepted.length);
  metrics.increment('ocr_jobs_completed', 1);
}

module.exports = { run: run, processImage: processImage, isDuplicate: isDuplicate, assertLease: assertLease };
