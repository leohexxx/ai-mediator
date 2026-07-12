// ═══════════════════════════════════════════════
// 案例服务层 - createCase/joinCase/getCaseDetail/getCaseList
// ═══════════════════════════════════════════════

var cloudUtil = require('../utils/cloud');

/**
 * 创建调解案例
 * @param {Object} params
 * @param {string} [params.title='调解案例']
 * @param {string} [params.relationship]
 * @param {'both'|'initiator_only'} [params.privacy='both']
 * @param {{nickname: string, avatarUrl: string}} [params.userInfo]
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function createCase(params) {
  return cloudUtil.callFunction('createCase', {
    title: params.title || '调解案例',
    relationship: params.relationship || '',
    privacy: params.privacy || 'both',
    userInfo: params.userInfo || { nickname: '微信用户', avatarUrl: '' },
  });
}

/**
 * 加入调解案例
 * @param {Object} params
 * @param {string} params.inviteCode - 6位邀请码
 * @param {{nickname: string, avatarUrl: string}} [params.userInfo]
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function joinCase(params) {
  return cloudUtil.callFunction('joinCase', {
    inviteCode: params.inviteCode,
    userInfo: params.userInfo || { nickname: '微信用户', avatarUrl: '' },
  });
}

/**
 * 获取案例详情（含隐私过滤）
 * @param {string} caseId
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function getCaseDetail(caseId) {
  return cloudUtil.callFunction('getCaseDetail', { caseId: caseId });
}

/**
 * 获取用户案例列表（分页）
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=10]
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function getCaseList(params) {
  params = params || {};
  return cloudUtil.callFunction('getCaseList', {
    page: params.page || 1,
    pageSize: params.pageSize || 10,
  });
}

/**
 * 生成邀请小程序码
 * @param {string} caseId
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function generateQRCode(caseId) {
  return cloudUtil.callFunction('generateQRCode', { caseId: caseId });
}

module.exports = {
  createCase: createCase,
  joinCase: joinCase,
  getCaseDetail: getCaseDetail,
  getCaseList: getCaseList,
  generateQRCode: generateQRCode,
};
