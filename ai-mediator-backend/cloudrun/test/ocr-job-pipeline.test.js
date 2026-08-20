var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var os = require('node:os');

process.env.LOCAL_MODE = 'true';
process.env.LOCAL_STORE_DIR = path.join(os.tmpdir(), 'ai-mediator-ocr-pipeline-' + process.pid + '-' + Date.now());

var db = require('../services/db');
var pipeline = require('../services/ocrJobPipeline');
var qwenVision = require('../services/qwenVision');
var storage = require('../services/evidenceStorage');


test('OCR 任务创建不读取历史批次，后台 Pipeline 仍加载历史哈希', async function () {
  var caseId = 'case-history-hash';
  await db.collection('evidence_batches').doc('batch-1').set({ data: {
    caseId: caseId,
    sourceHashes: ['historical-exact-hash'],
    perceptualHashes: [],
  } });

  var originalDownload = storage.loadCaseEvidenceImages;
  var originalRecognize = qwenVision.recognizeImage;
  storage.loadCaseEvidenceImages = async function () {
    // 1x1 PNG，确保哈希计算链路使用真实图片格式。
    var pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    return [{ index: 0, base64: pngBase64 }];
  };
  qwenVision.recognizeImage = async function () {
    return { text: '新消息', blocks: [], confidence: 95 };
  };

  try {
    var jobId = 'ocr-pipeline-job';
    await db.collection('ocr_jobs').doc(jobId).set({ data: {
      caseId: caseId,
      fileIds: ['cloud://env/evidence/' + caseId + '/new.png'],
      knownExactHashes: [],
      knownPerceptualHashes: [],
      status: 'running',
      job: { leaseOwner: 'worker-1', leaseUntil: new Date(Date.now() + 60000).toISOString(), attempts: 1 },
    } });
    await pipeline.run(jobId, { leaseOwner: 'worker-1' });
    var result = await db.collection('ocr_jobs').doc(jobId).get();
    assert.equal(result.data.status, 'completed');
    assert.equal(result.data.result.acceptedCount, 1);
    assert.equal(result.data.result.images[0].provider, 'qwen');
  } finally {
    storage.loadCaseEvidenceImages = originalDownload;
    qwenVision.recognizeImage = originalRecognize;
  }
});
