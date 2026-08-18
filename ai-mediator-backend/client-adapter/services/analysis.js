// ═══════════════════════════════════════════════
// 小程序适配代码 — 将 callFunction 改为 HTTP + WebSocket
// 替换原 miniprogram/services/analysis.js
// ═══════════════════════════════════════════════

var CLOUD_RUN_BASE = 'https://your-cloudrun-domain.tcloudbaseapp.com/api';

/**
 * 启动分析（HTTP 触发，WebSocket 接收进度）
 */
function analyzeCase(caseId, force, deep) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: CLOUD_RUN_BASE + '/analyze/start',
      method: 'POST',
      data: { caseId: caseId, deep: !!deep },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          resolve({ code: 0, data: res.data.data });
        } else {
          reject(new Error((res.data && res.data.message) || '分析启动失败'));
        }
      },
      fail: function (err) { reject(err); },
    });
  });
}

/**
 * 获取分析结果
 */
function getAnalysis(analysisId) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: CLOUD_RUN_BASE + '/analyze/' + analysisId,
      success: function (res) {
        if (res.data && res.data.code === 0) {
          resolve(res.data.data);
        } else {
          reject(new Error((res.data && res.data.message) || '获取分析结果失败'));
        }
      },
      fail: reject,
    });
  });
}

/**
 * 监听分析进度（WebSocket）
 * @param {string} analysisId
 * @param {function} onProgress
 * @param {function} onDone
 * @param {function} onError
 * @returns {{close: function}}
 */
function watchAnalysisProgress(analysisId, onProgress, onDone, onError) {
  var socketTask = wx.connectSocket({
    url: CLOUD_RUN_BASE.replace('/api', '/ws'),
  });

  var subscribed = false;

  socketTask.onOpen(function () {
    // 订阅该分析进度
    socketTask.send({
      data: JSON.stringify({ type: 'subscribe', analysisId: analysisId }),
    });
    subscribed = true;
  });

  socketTask.onMessage(function (res) {
    try {
      var msg = JSON.parse(res.data);
      if (msg.event === 'progress' && onProgress) onProgress(msg.data);
      if (msg.event === 'done' && onDone) onDone(msg.data);
      if (msg.event === 'error' && onError) onError(msg.data);
    } catch (e) { /* ignore */ }
  });

  socketTask.onError(function (err) {
    console.error('[WS] error:', err);
    if (onError) onError({ message: '连接断开' });
  });

  return {
    close: function () {
      if (socketTask && socketTask.close) socketTask.close();
    },
  };
}

module.exports = {
  analyzeCase: analyzeCase,
  getAnalysis: getAnalysis,
  watchAnalysisProgress: watchAnalysisProgress,
};
