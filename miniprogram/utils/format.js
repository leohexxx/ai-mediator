// ═══════════════════════════════════════════════
// 格式化工具函数
// ═══════════════════════════════════════════════

/**
 * 格式化 ISO 8601 日期为友好的相对时间
 * @param {string} isoString - ISO 8601 格式时间
 * @returns {string} 如 "刚刚"、"5分钟前"、"昨天 14:30"、"07-14"
 */
function formatTime(isoString) {
  if (!isoString) return '';

  var date = new Date(isoString);
  var now = new Date();
  var diff = now.getTime() - date.getTime();
  var seconds = Math.floor(diff / 1000);
  var minutes = Math.floor(seconds / 60);
  var hours = Math.floor(minutes / 60);
  var days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return minutes + '分钟前';
  if (hours < 24) return hours + '小时前';
  if (days === 1) return '昨天';
  if (days < 7) return days + '天前';

  // 超过一周显示具体日期
  var month = date.getMonth() + 1;
  var day = date.getDate();
  return (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
}

/**
 * 格式化 ISO 8601 日期为完整日期时间
 * @param {string} isoString
 * @returns {string} 如 "2025-07-14 08:30"
 */
function formatDateTime(isoString) {
  if (!isoString) return '';

  var date = new Date(isoString);
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  var hour = String(date.getHours()).padStart(2, '0');
  var minute = String(date.getMinutes()).padStart(2, '0');

  return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
}

/**
 * 截断文本
 * @param {string} text
 * @param {number} [maxLength=50]
 * @returns {string}
 */
function truncate(text, maxLength) {
  maxLength = maxLength || 50;
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * 状态文案映射
 * @param {string} status
 * @returns {string}
 */
function statusLabel(status) {
  var map = {
    'single_submitted': '已上传，待分析',
    'waiting_party_b': '等待乙方加入',
    'waiting_submission': '等待双方提交',
    'analyzing': '分析中',
    'single_completed': '分析完成',
    'completed': '分析完成',
    'expired': '已过期',
  };
  return map[status] || status;
}

/**
 * 关系类型文案映射
 * @param {string} relationship
 * @returns {string}
 */
function relationshipLabel(relationship) {
  var map = {
    'couple': '情侣',
    'friend': '朋友',
    'colleague': '同事',
    'family': '家人',
    'other': '其他',
  };
  return map[relationship] || relationship || '未设置';
}

/**
 * 隐私设置文案映射
 * @param {string} privacy
 * @returns {string}
 */
function privacyLabel(privacy) {
  var map = {
    'both': '双方可见',
    'initiator_only': '仅发起方可见',
  };
  return map[privacy] || privacy;
}

/**
 * 生成唯一 ID
 * @param {string} [prefix='']
 * @returns {string}
 */
function generateId(prefix) {
  prefix = prefix || '';
  var timestamp = Date.now().toString(36);
  var random = Math.random().toString(36).substring(2, 8);
  return prefix + timestamp + random;
}

module.exports = {
  formatTime: formatTime,
  formatDateTime: formatDateTime,
  truncate: truncate,
  statusLabel: statusLabel,
  relationshipLabel: relationshipLabel,
  privacyLabel: privacyLabel,
  generateId: generateId,
};
