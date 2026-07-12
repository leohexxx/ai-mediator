// ═══════════════════════════════════════════════
// 本地存储工具（wx.setStorageSync 封装）
// ═══════════════════════════════════════════════

var STORAGE_PREFIX = 'ai_mediator_';

/**
 * 获取缓存值
 * @param {string} key
 * @param {*} [defaultValue=null]
 * @returns {*}
 */
function get(key, defaultValue) {
  defaultValue = defaultValue !== undefined ? defaultValue : null;
  try {
    var value = wx.getStorageSync(STORAGE_PREFIX + key);
    return value !== '' ? value : defaultValue;
  } catch (err) {
    console.warn('storage.get 失败:', key, err);
    return defaultValue;
  }
}

/**
 * 设置缓存值
 * @param {string} key
 * @param {*} value
 */
function set(key, value) {
  try {
    wx.setStorageSync(STORAGE_PREFIX + key, value);
  } catch (err) {
    console.error('storage.set 失败:', key, err);
  }
}

/**
 * 移除缓存
 * @param {string} key
 */
function remove(key) {
  try {
    wx.removeStorageSync(STORAGE_PREFIX + key);
  } catch (err) {
    console.warn('storage.remove 失败:', key, err);
  }
}

/**
 * 清空所有带前缀的缓存
 */
function clear() {
  try {
    var info = wx.getStorageInfoSync();
    var keys = info.keys || [];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(STORAGE_PREFIX) === 0) {
        wx.removeStorageSync(keys[i]);
      }
    }
  } catch (err) {
    console.error('storage.clear 失败:', err);
  }
}

/**
 * 获取 JSON 缓存
 * @param {string} key
 * @param {*} [defaultValue=null]
 * @returns {*}
 */
function getJSON(key, defaultValue) {
  defaultValue = defaultValue !== undefined ? defaultValue : null;
  try {
    var raw = get(key);
    if (raw === null || raw === '') return defaultValue;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('storage.getJSON 解析失败:', key, err);
    return defaultValue;
  }
}

/**
 * 设置 JSON 缓存
 * @param {string} key
 * @param {*} value
 */
function setJSON(key, value) {
  try {
    set(key, JSON.stringify(value));
  } catch (err) {
    console.error('storage.setJSON 失败:', key, err);
  }
}

module.exports = {
  get: get,
  set: set,
  remove: remove,
  clear: clear,
  getJSON: getJSON,
  setJSON: setJSON,
};
