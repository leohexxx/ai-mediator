// ═══════════════════════════════════════════════
// 案例服务层 (v2 - 支持单人模式 + 分享)
// ═══════════════════════════════════════════════

var cloudUtil = require('../utils/cloud');

/**
 * 创建调解案例 (v2: 默认单人模式)
 * @param {Object} params
 * @param {string} [params.title='调解案例']
 * @param {string} [params.relationship]
 * @param {'both'|'initiator_only'} [params.privacy='both']
 * @param {'single'|'dual'} [params.mode='single']  - 单人/双人模式
 * @param {{nickname: string, avatarUrl: string}} [params.userInfo]
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function createCase(params) {
  return cloudUtil.callFunction('createCase', {
    title: params.title || '调解案例',
    relationship: params.relationship || '',
    privacy: params.privacy || 'both',
    mode: params.mode || 'single',
    userInfo: params.userInfo || { nickname: '微信用户', avatarUrl: '' },
  });
}

/**
 * 加入调解案例（双人模式）
 * @param {Object} params
 * @param {string} params.inviteCode
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
 * 生成邀请小程序码（双人模式）
 * @param {string} caseId
 * @returns {Promise<{code: number, data: Object|null, message: string}>}
 */
function generateQRCode(caseId) {
  return cloudUtil.callFunction('generateQRCode', { caseId: caseId });
}

/**
 * 获取分享卡片数据
 * @param {string} caseId
 * @param {'verdict'|'fun'|'suspense'|'compare'} [template='verdict']
 * @returns {Promise<{code: number, data: {cardId: string, cardData: Object}|null, message: string}>}
 */
function getShareCard(caseId, template) {
  return cloudUtil.callFunction('shareCard', {
    caseId: caseId,
    template: template || 'verdict',
  });
}

module.exports = {
  createCase: createCase,
  joinCase: joinCase,
  getCaseDetail: getCaseDetail,
  getCaseList: getCaseList,
  generateQRCode: generateQRCode,
  getShareCard: getShareCard,
};
