// ═══════════════════════════════════════════════
// 分析服务层 - analyzeCase 调用 + 进度监听
// ═══════════════════════════════════════════════

var cloudRun = require('../utils/cloudrun');
var cloudRunConfig = require('../config/cloudrun');

function callCloudRun(path, method, data) {
  return cloudRun.call(path, method, data);
}

/**
 * 触发案例分析
 * @param {string} caseId
 * @param {boolean} [force=false] - 兼容旧调用签名，V3 不允许绕过分析锁
 * @param {boolean} [deep=false] - 深度模式（Pro 加强判断/建议，耗时更长）
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function analyzeCase(caseId, force, deep, options) {
  options = options || {};
  var data = { caseId: caseId };
  if (deep) data.deep = true;
  if (options.perspective === 'communication') data.perspective = 'communication';
  if (options.evidenceRevision != null) data.evidenceRevision = options.evidenceRevision;
  data.idempotencyKey = options.idempotencyKey || cloudRun.idempotencyKey('analysis_' + caseId);
  return callCloudRun('/api/analyze/start', 'POST', data);
}

function cancelAnalysis(analysisId) {
  return callCloudRun('/api/analyze/' + encodeURIComponent(analysisId) + '/cancel', 'POST', {});
}

/**
 * 获取分析结果
 * @param {string} analysisId
 * @returns {Promise<Object>}
 */
function getAnalysis(analysisId) {
  return callCloudRun('/api/analyze/' + encodeURIComponent(analysisId), 'GET')
    .then(function (result) { return result.data; });
}

/**
 * 监听分析进度
 * @param {string} analysisId
 * @param {function(Object): void} onProgress - 进度回调 {step, message, progress}
 * @returns {{close: function(): void}}
 */
function watchAnalysisProgress(analysisId, onProgress) {
  return watchCloudRunAnalysisProgress(analysisId, onProgress);
}

function watchCloudRunAnalysisProgress(analysisId, onProgress) {
  var active = true;
  var timer = null;
  var lastProgress = '';
  var baseDelay = cloudRunConfig.progressPollIntervalMs || 1500;
  var nextDelay = baseDelay;

  function isTerminal(analysis) {
    return analysis && (analysis.status === 'completed' || analysis.status === 'failed' || analysis.status === 'canceled' ||
      (analysis.progress && (analysis.progress.step === 'done' || analysis.progress.step === 'error' || analysis.progress.step === 'canceled')));
  }

  function poll() {
    if (!active) return;
    getAnalysis(analysisId).then(function (analysis) {
      if (!active) return;
      var progress = analysis && analysis.progress;
      var progressKey = progress ? [progress.step, progress.message, progress.progress].join('|') : '';
      if (progress && progressKey !== lastProgress && onProgress) {
        lastProgress = progressKey;
        nextDelay = baseDelay;
        onProgress(progress);
      } else {
        nextDelay = Math.min(Math.round(nextDelay * 1.5), 8000);
      }

      if (!isTerminal(analysis)) {
        timer = setTimeout(poll, nextDelay);
      }
    }).catch(function (err) {
      console.error('CloudRun analysis progress query failed:', err);
      nextDelay = Math.min(Math.round(nextDelay * 1.5), 8000);
      if (active) timer = setTimeout(poll, nextDelay);
    });
  }

  poll();
  return {
    close: function () {
      active = false;
      if (timer) clearTimeout(timer);
    },
  };
}

module.exports = {
  analyzeCase: analyzeCase,
  getAnalysis: getAnalysis,
  watchAnalysisProgress: watchAnalysisProgress,
  cancelAnalysis: cancelAnalysis,
};
