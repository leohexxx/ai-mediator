var uuid = require('uuid');
var defaultDb = require('./db');
var defaultPipeline = require('./ocrJobPipeline');
var config = require('../config');
var metrics = require('./metrics');

function createWorker(options) {
  options = options || {};
  var database = options.db || defaultDb;
  var pipeline = options.pipeline || defaultPipeline;
  var workerId = options.workerId || uuid.v4();
  var intervalMs = options.intervalMs || config.qwenVision.pollIntervalMs;
  var leaseMs = options.leaseMs || config.qwenVision.leaseMs;
  var maxAttempts = options.maxAttempts || config.qwenVision.maxAttempts;
  var maxConcurrent = options.maxConcurrent || config.qwenVision.maxConcurrent;
  var timer = null;
  var scanPromise = null;
  var running = {};

  async function candidates(status) {
    var result = await database.collection('ocr_jobs').where({ status: status }).limit(50).get();
    return result.data || [];
  }

  async function claim(candidate) {
    var claimed = null;
    await database.runTransaction(async function (transaction) {
      var ref = transaction.collection('ocr_jobs').doc(candidate._id);
      var result = await ref.get();
      var current = result.data;
      if (!current) return;
      var leaseExpired = !current.job || !current.job.leaseUntil || new Date(current.job.leaseUntil).getTime() <= Date.now();
      if (current.status !== 'queued' && !(current.status === 'running' && leaseExpired)) return;
      var attempts = Number(current.job && current.job.attempts) || 0;
      if (attempts >= maxAttempts) {
        await ref.update({ data: {
          status: 'failed', errorCode: 'OCR_RETRY_EXHAUSTED', errorMessage: '图片识别失败，请重新提交该批图片',
          'job.leaseOwner': null, 'job.leaseUntil': null, updatedAt: new Date().toISOString(),
        } });
        return;
      }
      var now = new Date();
      var leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
      await ref.update({ data: {
        status: 'running',
        'job.attempts': attempts + 1,
        'job.leaseOwner': workerId,
        'job.leaseUntil': leaseUntil,
        updatedAt: now.toISOString(),
      } });
      claimed = Object.assign({}, current, {
        status: 'running',
        job: Object.assign({}, current.job || {}, { attempts: attempts + 1, leaseOwner: workerId, leaseUntil: leaseUntil }),
      });
    });
    return claimed;
  }

  async function fail(job, error) {
    var terminal = job.job.attempts >= maxAttempts;
    var now = new Date().toISOString();
    await database.runTransaction(async function (transaction) {
      var ref = transaction.collection('ocr_jobs').doc(job._id);
      var currentResult = await ref.get();
      var current = currentResult.data;
      if (!current || !current.job || current.job.leaseOwner !== workerId) return;
      await ref.update({ data: {
        status: terminal ? 'failed' : 'queued',
        errorCode: terminal ? 'OCR_JOB_FAILED' : '',
        errorMessage: terminal ? '图片识别失败：' + (error.message || '未知错误') : '',
        'job.leaseOwner': null,
        'job.leaseUntil': null,
        updatedAt: now,
      } });
    });
    metrics.increment('ocr_jobs_failed', 1);
  }

  async function execute(candidate) {
    var job = await claim(candidate);
    if (!job || running[job._id]) return;
    running[job._id] = true;
    var startedAt = Date.now();
    console.log(JSON.stringify({
      event: 'ocr_job_started',
      jobId: job._id,
      imageCount: (job.fileIds || []).length,
      attempt: job.job && job.job.attempts || 0,
      workerId: workerId,
    }));
    try {
      await pipeline.run(job._id, { leaseOwner: workerId });
      console.log(JSON.stringify({
        event: 'ocr_job_completed',
        jobId: job._id,
        durationMs: Date.now() - startedAt,
        workerId: workerId,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: 'ocr_job_failed',
        jobId: job._id,
        durationMs: Date.now() - startedAt,
        errorCode: error.code || 'OCR_JOB_FAILED',
        message: error.message || 'unknown error',
        workerId: workerId,
      }));
      await fail(job, error);
    } finally {
      delete running[job._id];
    }
  }

  async function scan() {
    var queued = await candidates('queued');
    var leased = await candidates('running');
    metrics.gauge('ocr_queue_length', queued.length);
    var list = queued.concat(leased).filter(function (item) { return !running[item._id]; });
    var available = Math.max(0, maxConcurrent - Object.keys(running).length);
    await Promise.all(list.slice(0, available).map(execute));
  }

  function kick() {
    if (!scanPromise) scanPromise = scan().finally(function () { scanPromise = null; });
    return scanPromise;
  }

  function start() {
    if (timer) return;
    kick().catch(function (error) { console.error('[OcrWorker] startup scan failed:', error.message); });
    timer = setInterval(function () {
      kick().catch(function (error) { console.error('[OcrWorker] scan failed:', error.message); });
    }, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start: start, stop: stop, kick: kick, claim: claim };
}

module.exports = { createWorker: createWorker };
