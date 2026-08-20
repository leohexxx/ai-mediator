// ═══════════════════════════════════════════════
// joinCase 云函数
// 职责: 校验邀请码 → 更新 cases.party_b
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var caseStatus = require('./common/caseStatus');
var STATUS = caseStatus.STATUS;

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
    if (caseStatus.isClosed(caseData.status)) {
      return { code: -1, data: null, message: '该案例已完成或已过期，无法加入' };
    }

    var now = new Date().toISOString();
    var nextStatus = caseStatus.assertTransition(caseData.status, STATUS.DUAL_COLLECTING);

    // 用条件更新原子抢占邀请码，解决两个用户同时加入的竞态。
    var reserveResult = await db.collection('invitations').where({
      _id: invitation._id,
      used: false,
    }).update({
      data: {
        used: true,
        usedBy: openid,
        usedAt: now,
      },
    });
    var reserved = reserveResult.stats ? reserveResult.stats.updated : reserveResult.updated;
    if (reserved !== 1) {
      return { code: -1, data: null, message: '邀请码已被其他用户使用' };
    }

    try {
      await db.collection('cases').doc(invitation.caseId).update({
        data: {
          'party_b.openid': openid,
          'party_b.nickname': userInfo.nickname,
          'party_b.avatarUrl': userInfo.avatarUrl,
          'status': nextStatus,
          updatedAt: now,
        },
      });
    } catch (caseUpdateError) {
      // 补偿释放只属于本次调用的占用，避免后续无法重试。
      await db.collection('invitations').where({ _id: invitation._id, usedBy: openid }).update({
        data: { used: false, usedBy: null, usedAt: null },
      }).catch(function () {});
      throw caseUpdateError;
    }

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
