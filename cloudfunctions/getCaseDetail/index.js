// ═══════════════════════════════════════════════
// getCaseDetail 云函数 (v2 - 支持单人模式)
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

    // 权限校验：支持单人模式 (party_b 可能为 null)
    var isPartyA = caseData.party_a.openid === openid;
    var hasPartyB = caseData.party_b && caseData.party_b.openid;
    var isPartyB = hasPartyB && caseData.party_b.openid === openid;

    if (!isPartyA && !isPartyB) {
      return { code: -1, data: null, message: '无权查看此案例' };
    }

    var role = isPartyA ? 'party_a' : 'party_b';
    var isSingleMode = caseData.mode === 'single' || (!hasPartyB);
    var isCompleted = caseData.status === 'completed' || caseData.status === 'single_completed' 
      || caseData.status === 'dual_a_submitted' || caseData.status === 'dual_b_submitted';

    // 获取己方证据
    var myEvidence = await db.collection('evidence')
      .where({ caseId: caseId, party: role })
      .get();

    // 获取对方证据（仅双人 + 分析完成 + 双方可见模式下可见）
    var otherParty = role === 'party_a' ? 'party_b' : 'party_a';
    var otherEvidence = null;

    if (!isSingleMode && (isCompleted || caseData.status === 'dual_a_submitted' || caseData.status === 'dual_b_submitted') && caseData.privacy === 'both') {
      var otherResult = await db.collection('evidence')
        .where({ caseId: caseId, party: otherParty })
        .get();
      otherEvidence = otherResult.data.length > 0 ? otherResult.data[0] : null;
    }

    // 获取分析报告
    var analysis = null;
    if (caseData.analysisId) {
      var analysisResult = await db.collection('analyses').doc(caseData.analysisId).get();
      var analysisData = analysisResult.data;

      if (analysisData && caseData.privacy === 'initiator_only' && role === 'party_b') {
        analysis = {
          _id: analysisData._id,
          caseId: analysisData.caseId,
          schemaVersion: analysisData.schemaVersion,
          progress: analysisData.progress,
          createdAt: analysisData.createdAt,
          restricted: true,
          restrictedMessage: '分析已完成，结果仅对发起方可见',
        };
      } else {
        analysis = analysisData;
      }
    }

    // 获取邀请信息（仅双人模式）
    var invitation = null;
    if (!isSingleMode) {
      var invResult = await db.collection('invitations')
        .where({ caseId: caseId })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      invitation = invResult.data.length > 0 ? invResult.data[0] : null;
    }

    return {
      code: 0,
      data: {
        caseData: caseData,
        role: role,
        myEvidence: myEvidence.data.length > 0 ? myEvidence.data[0] : null,
        otherEvidence: otherEvidence,
        analysis: analysis,
        invitation: invitation,
        isSingleMode: isSingleMode,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('getCaseDetail error:', error);
    return { code: -1, data: null, message: error.message || '获取案例详情失败' };
  }
};
