// ═══════════════════════════════════════════════
// 分析服务层 - analyzeCase 调用 + 进度监听
// ═══════════════════════════════════════════════

var cloudUtil = require('../utils/cloud');

/**
 * 触发案例分析
 * @param {string} caseId
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function analyzeCase(caseId) {
  return cloudUtil.callFunction('analyzeCase', { caseId: caseId });
}

/**
 * 获取分析结果
 * @param {string} analysisId
 * @returns {Promise<Object>}
 */
function getAnalysis(analysisId) {
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

module.exports = {
  analyzeCase: analyzeCase,
  getAnalysis: getAnalysis,
  watchAnalysisProgress: watchAnalysisProgress,
};
