var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');
var os = require('node:os');

process.env.LOCAL_MODE = 'true';
process.env.LOCAL_STORE_DIR = path.join(os.tmpdir(), 'ai-mediator-ocr-worker-' + process.pid + '-' + Date.now());
var db = require('../services/db');
var createWorker = require('../services/ocrWorker').createWorker;

test('OCR Worker通过数据库租约领取异步任务', async function () {
  var jobId = 'ocr-worker-job';
  await db.collection('ocr_jobs').doc(jobId).set({ data: {
    caseId: 'case-1', status: 'queued', fileIds: ['cloud://env/evidence/case-1/a.jpg'],
    job: { attempts: 0, leaseOwner: null, leaseUntil: null }, createdAt: new Date().toISOString(),
  } });
  var executed = [];
  var worker = createWorker({
    db: db,
    workerId: 'ocr-test-worker',
    pipeline: { run: async function (id, options) {
      executed.push({ id: id, owner: options.leaseOwner });
      await db.collection('ocr_jobs').doc(id).update({ data: { status: 'completed' } });
    } },
  });
  await worker.kick();
  var result = await db.collection('ocr_jobs').doc(jobId).get();
  assert.equal(result.data.status, 'completed');
  assert.deepEqual(executed, [{ id: jobId, owner: 'ocr-test-worker' }]);
  assert.equal(result.data.job.attempts, 1);
});
