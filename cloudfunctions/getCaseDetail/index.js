// ═══════════════════════════════════════════════
// getCaseDetail 云函数
// 职责: 案例详情 + 权限校验 + 隐私过滤
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

/**
 * 云函数入口
 * @param {Object} event
 * @param {string} event.caseId - 案例 ID
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var caseId = event.caseId;
    if (!caseId) {
      return { code: -1, data: null, message: '缺少案例 ID' };
    }

    // 获取案例
    var caseResult = await db.collection('cases').doc(caseId).get();
    var caseData = caseResult.data;

    if (!caseData) {
      return { code: -1, data: null, message: '案例不存在' };
    }

    // 权限校验：仅甲乙方可查看
    var isPartyA = caseData.party_a.openid === openid;
    var isPartyB = caseData.party_b.openid === openid;

    if (!isPartyA && !isPartyB) {
      return { code: -1, data: null, message: '无权查看此案例' };
    }

    var role = isPartyA ? 'party_a' : 'party_b';

    // 获取己方证据（自己的证据始终可见）
    var myEvidence = await db.collection('evidence')
      .where({ caseId: caseId, party: role })
      .get();

    // 获取对方证据（仅分析完成 + 双方可见模式下可见）
    var otherParty = role === 'party_a' ? 'party_b' : 'party_a';
    var otherEvidence = null;

    if (caseData.status === 'completed' && caseData.privacy === 'both') {
      var otherResult = await db.collection('evidence')
        .where({ caseId: caseId, party: otherParty })
        .get();
      otherEvidence = otherResult.data.length > 0 ? otherResult.data[0] : null;
    }

    // 获取分析报告（隐私控制）
    var analysis = null;
    if (caseData.analysisId) {
      var analysisResult = await db.collection('analyses').doc(caseData.analysisId).get();
      var analysisData = analysisResult.data;

      // 隐私过滤：仅发起方可见模式下，乙方不能看分析
      if (analysisData && caseData.privacy === 'initiator_only' && role === 'party_b') {
        analysis = {
          _id: analysisData._id,
          caseId: analysisData.caseId,
          schemaVersion: analysisData.schemaVersion,
          progress: analysisData.progress,
          createdAt: analysisData.createdAt,
          // 隐私模式：乙方仅看到概述
          restricted: true,
          restrictedMessage: '分析已完成，结果仅对发起方可见',
        };
      } else {
        analysis = analysisData;
      }
    }

    // 获取邀请信息
    var invitation = await db.collection('invitations')
      .where({ caseId: caseId })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    return {
      code: 0,
      data: {
        caseData: caseData,
        role: role,
        myEvidence: myEvidence.data.length > 0 ? myEvidence.data[0] : null,
        otherEvidence: otherEvidence,
        analysis: analysis,
        invitation: invitation.data.length > 0 ? invitation.data[0] : null,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('getCaseDetail error:', error);
    return { code: -1, data: null, message: error.message || '获取案例详情失败' };
  }
};
