var uuid = require('uuid');
var defaultDb = require('./db');
var defaultPipeline = require('./analysisPipeline');
var config = require('../config');

function createWorker(options) {
  options = options || {};
  var db = options.db || defaultDb;
  var pipeline = options.pipeline || defaultPipeline;
  var workerId = options.workerId || uuid.v4();
  var intervalMs = options.intervalMs || config.analysisJobs.pollIntervalMs;
  var leaseMs = options.leaseMs || config.analysisJobs.leaseMs;
  var maxAttempts = options.maxAttempts || config.analysisJobs.maxAttempts;
  var timer = null;
  var scanPromise = null;
  var running = {};

  async function candidatesFor(status) {
    var result = await db.collection('analyses').where({ status: status }).limit(20).get();
    return result.data || [];
  }

  async function claim(candidate) {
    var claimed = null;
    await db.runTransaction(async function (transaction) {
      var ref = transaction.collection('analyses').doc(candidate._id);
      var result = await ref.get();
      var current = result.data;
      if (!current) return;
      var job = current.job || {};
      var leaseExpired = !job.leaseUntil || new Date(job.leaseUntil).getTime() <= Date.now();
      if (current.status !== 'queued' && !(current.status === 'running' && leaseExpired)) return;
      var attempts = Number(job.attempts) || 0;
      if (attempts >= maxAttempts) return;
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
        job: Object.assign({}, job, { attempts: attempts + 1, leaseOwner: workerId, leaseUntil: leaseUntil }),
      });
    });
    return claimed;
  }

  async function fail(job, error) {
    var terminal = job.job.attempts >= maxAttempts;
    var now = new Date().toISOString();
    await db.runTransaction(async function (transaction) {
      var analysisRef = transaction.collection('analyses').doc(job._id);
      var latestResult = await analysisRef.get();
      var latest = latestResult.data;
      if (!latest || !latest.job || latest.job.leaseOwner !== workerId) return;
      await analysisRef.update({ data: {
        status: terminal ? 'failed' : 'queued',
        progress: {
          step: terminal ? 'error' : 'retrying',
          message: terminal ? '分析失败，请稍后重试' : '分析暂时失败，正在自动重试...',
          progress: 0,
        },
        lastError: error.message || String(error),
        'job.leaseOwner': null,
        'job.leaseUntil': null,
        updatedAt: now,
      } });

      if (terminal) {
        var caseRef = transaction.collection('cases').doc(latest.caseId);
        var caseResult = await caseRef.get();
        if (caseResult.data && caseResult.data.analysisId === latest._id) {
          await caseRef.update({ data: {
            status: (latest.job && latest.job.previousCaseStatus) || 'waiting_submission',
            updatedAt: now,
          } });
        }
      }
    });
  }

  async function execute(candidate) {
    var job = await claim(candidate);
    if (!job || running[job._id]) return;
    running[job._id] = true;
    try {
      await pipeline.run(job._id, { leaseOwner: workerId });
    } catch (error) {
      console.error('[AnalysisWorker] job failed ' + job._id + ':', error.message);
      await fail(job, error);
    } finally {
      delete running[job._id];
    }
  }

  async function scan() {
    var queued = await candidatesFor('queued');
    var leased = await candidatesFor('running');
    var candidates = queued.concat(leased).filter(function (item) { return !running[item._id]; });
    await Promise.all(candidates.map(execute));
  }

  function kick() {
    if (!scanPromise) {
      scanPromise = scan().finally(function () { scanPromise = null; });
    }
    return scanPromise;
  }

  function start() {
    if (timer) return;
    kick().catch(function (error) { console.error('[AnalysisWorker] startup scan failed:', error.message); });
    timer = setInterval(function () {
      kick().catch(function (error) { console.error('[AnalysisWorker] scan failed:', error.message); });
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
