// ═══════════════════════════════════════════════
// createCase 云函数
// 职责: 创建案例 + 生成6位邀请码 + 写入 cases/invitations
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

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
 * @param {string} event.title - 案例标题
 * @param {string} [event.relationship] - 关系类型
 * @param {'both'|'initiator_only'} [event.privacy] - 隐私设置
 * @param {{nickname: string, avatarUrl: string}} [event.userInfo] - 用户昵称头像
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var title = event.title || '调解案例';
    var relationship = event.relationship || '';
    var privacy = event.privacy || 'both';
    var userInfo = event.userInfo || { nickname: '微信用户', avatarUrl: '' };

    // 生成唯一邀请码（最多重试5次）
    var inviteCode = generateInviteCode();
    var retries = 0;
    var maxRetries = 5;

    while (retries < maxRetries) {
      var existResult = await db.collection('invitations')
        .where({ inviteCode: inviteCode, used: false })
        .get();

      if (existResult.data.length === 0) {
        break;
      }
      inviteCode = generateInviteCode();
      retries++;
    }

    if (retries >= maxRetries) {
      return { code: -1, data: null, message: '生成邀请码失败，请重试' };
    }

    var now = new Date().toISOString();

    // 创建案例文档
    var caseResult = await db.collection('cases').add({
      data: {
        title: title,
        relationship: relationship,
        privacy: privacy,
        party_a: {
          openid: openid,
          nickname: userInfo.nickname,
          avatarUrl: userInfo.avatarUrl,
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
        status: 'waiting_party_b',
        analysisId: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 创建邀请记录
    await db.collection('invitations').add({
      data: {
        caseId: caseResult._id,
        inviteCode: inviteCode,
        used: false,
        usedBy: null,
        createdAt: now,
      },
    });

    return {
      code: 0,
      data: {
        caseId: caseResult._id,
        inviteCode: inviteCode,
        title: title,
        relationship: relationship,
        privacy: privacy,
        createdAt: now,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('createCase error:', error);
    return { code: -1, data: null, message: error.message || '创建案例失败' };
  }
};
