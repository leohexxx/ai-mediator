// ═══════════════════════════════════════════════
// createCase 云函数 (v2 - 支持单人/双人模式)
// 职责: 创建案例 + 双人模式生成邀请码 + 写入 cases
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var caseStatus = require('./common/caseStatus');
var STATUS = caseStatus.STATUS;

/**
 * 生成6位数字邀请码
 * @returns {string}
 */
function generateInviteCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 云函数入口
 * @param {Object} event
 * @param {string} [event.title='调解案例'] - 案例标题
 * @param {string} [event.relationship] - 关系类型(情侣/朋友/同事/家人/其他)
 * @param {'both'|'initiator_only'} [event.privacy='both'] - 隐私设置
 * @param {'single'|'dual'} [event.mode='single'] - 模式: single=单人, dual=双人协作
 * @param {{nickname: string, avatarUrl: string}} [event.userInfo] - 用户信息
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var title = event.title || '调解案例';
    var relationship = event.relationship || '';
    var privacy = event.privacy || 'both';
    var mode = event.mode || 'single';
    var userInfo = event.userInfo || { nickname: '微信用户', avatarUrl: '' };

    var now = new Date().toISOString();
    var inviteCode = null;

    // 双人模式: 生成唯一邀请码
    if (mode === 'dual') {
      inviteCode = generateInviteCode();
      var retries = 0;
      var maxRetries = 5;

      while (retries < maxRetries) {
        var existResult = await db.collection('invitations')
          .where({ inviteCode: inviteCode, used: false })
          .get();

        if (existResult.data.length === 0) break;
        inviteCode = generateInviteCode();
        retries++;
      }

      if (retries >= maxRetries) {
        return { code: -1, data: null, message: '生成邀请码失败，请重试' };
      }
    }

    // 初始状态：单人模式直接等待上传，双人模式等待对方加入
    var initialStatus = mode === 'single' ? STATUS.WAITING_SUBMISSION : STATUS.WAITING_PARTY_B;

    // 创建案例文档
    var caseData = {
      title: title,
      relationship: relationship,
      privacy: privacy,
      mode: mode,
      party_a: {
        openid: openid,
        nickname: userInfo.nickname || '微信用户',
        avatarUrl: userInfo.avatarUrl || '',
        submitted: false,
        submittedAt: null,
      },
      party_b: {
        openid: null,
        nickname: '',
        avatarUrl: '',
        submitted: false,
        submittedAt: null,
      },
      status: initialStatus,
      analysisId: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    };

    var caseResult = await db.collection('cases').add({ data: caseData });

    // 双人模式: 创建邀请记录
    if (mode === 'dual' && inviteCode) {
      await db.collection('invitations').add({
        data: {
          caseId: caseResult._id,
          inviteCode: inviteCode,
          used: false,
          usedBy: null,
          createdAt: now,
        },
      });
    }

    return {
      code: 0,
      data: {
        caseId: caseResult._id,
        inviteCode: inviteCode,
        title: title,
        relationship: relationship,
        privacy: privacy,
        mode: mode,
        status: initialStatus,
        createdAt: now,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('createCase error:', error);
    return { code: -1, data: null, message: error.message || '创建案例失败' };
  }
};
