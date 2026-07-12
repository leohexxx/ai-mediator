// ═══════════════════════════════════════════════
// joinCase 云函数
// 职责: 校验邀请码 → 更新 cases.party_b
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

/**
 * 云函数入口
 * @param {Object} event
 * @param {string} event.inviteCode - 6位邀请码
 * @param {{nickname: string, avatarUrl: string}} [event.userInfo] - 用户信息
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var inviteCode = event.inviteCode;
    if (!inviteCode) {
      return { code: -1, data: null, message: '缺少邀请码' };
    }

    var userInfo = event.userInfo || { nickname: '微信用户', avatarUrl: '' };

    // 查找邀请记录
    var inviteResult = await db.collection('invitations')
      .where({ inviteCode: inviteCode, used: false })
      .get();

    if (inviteResult.data.length === 0) {
      return { code: -1, data: null, message: '邀请码无效或已被使用' };
    }

    var invitation = inviteResult.data[0];

    // 获取案例
    var caseResult = await db.collection('cases').doc(invitation.caseId).get();
    var caseData = caseResult.data;

    if (!caseData) {
      return { code: -1, data: null, message: '案例不存在' };
    }

    // 检查是否是甲方本人
    if (caseData.party_a.openid === openid) {
      return { code: -1, data: null, message: '不能加入自己创建的案例' };
    }

    // 检查乙方是否已被占用
    if (caseData.party_b.openid && caseData.party_b.openid !== openid) {
      return { code: -1, data: null, message: '该案例已有其他用户加入' };
    }

    // 检查案例状态
    if (caseData.status === 'completed' || caseData.status === 'expired') {
      return { code: -1, data: null, message: '该案例已完成或已过期，无法加入' };
    }

    var now = new Date().toISOString();

    // 更新案例
    await db.collection('cases').doc(invitation.caseId).update({
      data: {
        'party_b.openid': openid,
        'party_b.nickname': userInfo.nickname,
        'party_b.avatarUrl': userInfo.avatarUrl,
        'status': 'waiting_submission',
        updatedAt: now,
      },
    });

    // 标记邀请码已使用
    await db.collection('invitations').doc(invitation._id).update({
      data: {
        used: true,
        usedBy: openid,
      },
    });

    return {
      code: 0,
      data: {
        caseId: invitation.caseId,
        role: 'party_b',
        title: caseData.title,
        relationship: caseData.relationship,
        privacy: caseData.privacy,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('joinCase error:', error);
    return { code: -1, data: null, message: error.message || '加入案例失败' };
  }
};
