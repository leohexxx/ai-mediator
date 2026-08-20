var config = require('../config/cloudrun');

function isEnabled() {
  return config.enabled === true && !!config.env && !!config.serviceName &&
    !!(wx.cloud && typeof wx.cloud.callContainer === 'function');
}

function getRelease() {
  return config.release || 'unknown';
}

function call(path, method, data) {
  if (!isEnabled()) return Promise.reject(new Error('CloudRun未启用或配置不完整'));
  return new Promise(function (resolve, reject) {
    wx.cloud.callContainer({
      config: { env: config.env },
      path: path,
      method: method || 'GET',
      data: data,
      header: { 'X-WX-SERVICE': config.serviceName, 'content-type': 'application/json' },
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          resolve(res.data);
          return;
        }
        var error = new Error((res.data && res.data.message) || 'CloudRun请求失败');
        error.statusCode = res.statusCode;
        error.errorCode = (res.data && res.data.errorCode) || 'CLOUDRUN_ERROR';
        reject(error);
      },
      fail: reject,
    });
  });
}

function idempotencyKey(prefix) {
  return (prefix || 'request') + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
}

module.exports = { isEnabled: isEnabled, call: call, idempotencyKey: idempotencyKey, getRelease: getRelease };
