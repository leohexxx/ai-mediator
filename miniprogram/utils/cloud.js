// ═══════════════════════════════════════════════
// 云函数调用封装（统一错误处理 + 返回格式标准化）
// ═══════════════════════════════════════════════

/**
 * 调用云函数。
 * 统一返回格式：{ code: 0, data: {...}, message: 'ok' }
 *
 * @param {string} name - 云函数名称
 * @param {Object} [data={}] - 调用参数
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function callFunction(name, data) {
  data = data || {};
  return new Promise(function (resolve, reject) {
    wx.cloud.callFunction({
      name: name,
      data: data,
      success: function (res) {
        var result = res.result;
        if (result && result.code === 0) {
          resolve(result);
        } else if (result) {
          // 业务错误（云函数返回了错误码）
          console.warn('云函数 ' + name + ' 业务错误:', result.message);
          resolve(result);
        } else {
          reject(new Error('云函数 ' + name + ' 返回格式异常'));
        }
      },
      fail: function (err) {
        console.error('云函数 ' + name + ' 调用失败:', err);
        reject(err);
      },
    });
  });
}

/**
 * 上传文件到云存储
 * @param {string} cloudPath - 云存储路径
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<{fileID: string, statusCode: number}>}
 */
function uploadFile(cloudPath, filePath) {
  return new Promise(function (resolve, reject) {
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: function (res) {
        resolve({ fileID: res.fileID, statusCode: res.statusCode });
      },
      fail: function (err) {
        reject(err);
      },
    });
  });
}

/**
 * 获取临时文件链接
 * @param {string} fileID - 云存储 fileID
 * @returns {Promise<string>}
 */
function getTempFileURL(fileID) {
  return new Promise(function (resolve, reject) {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: function (res) {
        if (res.fileList && res.fileList.length > 0) {
          resolve(res.fileList[0].tempFileURL);
        } else {
          reject(new Error('获取临时链接失败'));
        }
      },
      fail: function (err) {
        reject(err);
      },
    });
  });
}

/**
 * 获取云数据库引用
 * @returns {wx.DB}
 */
function getDatabase() {
  return wx.cloud.database();
}

module.exports = {
  callFunction: callFunction,
  uploadFile: uploadFile,
  getTempFileURL: getTempFileURL,
  getDatabase: getDatabase,
};
