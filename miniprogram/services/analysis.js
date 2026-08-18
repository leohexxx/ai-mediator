// ═══════════════════════════════════════════════
// 分析服务层 - analyzeCase 调用 + 进度监听
// ═══════════════════════════════════════════════

var cloudUtil = require('../utils/cloud');
var cloudRunConfig = require('../config/cloudrun');

function isCloudRunEnabled() {
  return cloudRunConfig.enabled === true &&
    !!cloudRunConfig.env &&
    !!cloudRunConfig.serviceName &&
    !!(wx.cloud && typeof wx.cloud.callContainer === 'function');
}

function callCloudRun(path, method, data) {
  return new Promise(function (resolve, reject) {
    var request = {
      config: { env: cloudRunConfig.env },
      path: path,
      method: method,
      header: { 'X-WX-SERVICE': cloudRunConfig.serviceName },
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          resolve(res.data);
          return;
        }
        reject(new Error((res.data && res.data.message) || 'CloudRun 请求失败'));
      },
      fail: function (err) { reject(err); },
    };
    if (data !== undefined) request.data = data;
    wx.cloud.callContainer(request);
  });
}

/**
 * 触发案例分析
 * @param {string} caseId
 * @param {boolean} [force=false] - 强制重新分析（用于卡死恢复/重新分析，绕过 analyzing 拦截）
 * @param {boolean} [deep=false] - 深度模式（Pro 加强判断/建议，耗时更长）
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function analyzeCase(caseId, force, deep) {
  var data = { caseId: caseId };
  if (force) data.force = true;
  if (deep) data.deep = true;
  if (isCloudRunEnabled()) {
    return callCloudRun('/api/analyze/start', 'POST', data);
  }
  return cloudUtil.callFunction('analyzeCase', data);
}

/**
 * 获取分析结果
 * @param {string} analysisId
 * @returns {Promise<Object>}
 */
function getAnalysis(analysisId) {
  if (isCloudRunEnabled()) {
    return callCloudRun('/api/analyze/' + encodeURIComponent(analysisId), 'GET')
      .then(function (result) { return result.data; });
  }

  return new Promise(function (resolve, reject) {
    var db = cloudUtil.getDatabase();
    db.collection('analyses').doc(analysisId).get({
      success: function (res) {
        resolve(res.data);
      },
      fail: function (err) {
        reject(err);
      },
    });
  });
}

/**
 * 监听分析进度
 * @param {string} analysisId
 * @param {function(Object): void} onProgress - 进度回调 {step, message, progress}
 * @returns {{close: function(): void}}
 */
function watchAnalysisProgress(analysisId, onProgress) {
  if (isCloudRunEnabled()) {
    return watchCloudRunAnalysisProgress(analysisId, onProgress);
  }

  var db = cloudUtil.getDatabase();

  try {
    var watcher = db.collection('analyses')
      .where({ _id: analysisId })
      .field({ progress: true })
      .watch({
        onChange: function (snapshot) {
          if (snapshot.docs && snapshot.docs.length > 0) {
            var progress = snapshot.docs[0].progress;
            if (progress && onProgress) {
              onProgress(progress);
            }

            if (progress && progress.step === 'done') {
              if (watcher && watcher.close) {
                watcher.close();
              }
            }
          }
        },
        onError: function (err) {
          console.error('watch analysis progress error:', err);
        },
      });

    return {
      close: function () {
        if (watcher && watcher.close) {
          watcher.close();
        }
      },
    };
  } catch (err) {
    // 降级为轮询
    console.warn('watch API 不可用，使用轮询方案');
    var polling = true;

    var timer = setInterval(function () {
      if (!polling) return;

      db.collection('analyses')
        .where({ _id: analysisId })
        .field({ progress: true })
        .get({
          success: function (res) {
            if (res.data && res.data.length > 0) {
              var progress = res.data[0].progress;
              if (progress && onProgress) {
                onProgress(progress);
              }

              if (progress && progress.step === 'done') {
                polling = false;
              }
            }
          },
        });
    }, 1000);

    return {
      close: function () {
        polling = false;
        clearInterval(timer);
      },
    };
  }
}

function watchCloudRunAnalysisProgress(analysisId, onProgress) {
  var active = true;
  var timer = null;
  var lastProgress = '';

  function isTerminal(analysis) {
    return analysis && (analysis.status === 'completed' || analysis.status === 'failed' ||
      (analysis.progress && (analysis.progress.step === 'done' || analysis.progress.step === 'error')));
  }

  function poll() {
    if (!active) return;
    getAnalysis(analysisId).then(function (analysis) {
      if (!active) return;
      var progress = analysis && analysis.progress;
      var progressKey = progress ? [progress.step, progress.message, progress.progress].join('|') : '';
      if (progress && progressKey !== lastProgress && onProgress) {
        lastProgress = progressKey;
        onProgress(progress);
      }

      if (!isTerminal(analysis)) {
        timer = setTimeout(poll, cloudRunConfig.progressPollIntervalMs || 1500);
      }
    }).catch(function (err) {
      console.error('CloudRun analysis progress query failed:', err);
      if (active) timer = setTimeout(poll, cloudRunConfig.progressPollIntervalMs || 1500);
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
};
