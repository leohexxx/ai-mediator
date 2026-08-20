// 受权读取分析记录；替代小程序直接访问 analyses 集合。
var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var db = cloud.database();

exports.main = async function (event) {
  var openid = cloud.getWXContext().OPENID;
  try {
    if (!event.analysisId) return { code: -1, data: null, message: '缺少分析 ID' };
    var analysisResult = await db.collection('analyses').doc(event.analysisId).get();
    var analysis = analysisResult.data;
    if (!analysis) return { code: -1, data: null, message: '分析记录不存在' };

    var caseResult = await db.collection('cases').doc(analysis.caseId).get();
    var caseData = caseResult.data;
    if (!caseData) return { code: -1, data: null, message: '案例不存在' };
    var isPartyA = caseData.party_a && caseData.party_a.openid === openid;
    var isPartyB = caseData.party_b && caseData.party_b.openid === openid;
    if (!isPartyA && !isPartyB) return { code: -1, data: null, message: '无权访问此分析' };

    if (caseData.privacy === 'initiator_only' && !isPartyA) {
      return {
        code: 0,
        data: {
          _id: analysis._id,
          caseId: analysis.caseId,
          status: analysis.status,
          progress: analysis.progress,
          restricted: true,
        },
        message: 'ok',
      };
    }
    return { code: 0, data: analysis, message: 'ok' };
  } catch (error) {
    console.error('getAnalysis error:', error);
    return { code: -1, data: null, message: error.message || '获取分析失败' };
  }
};
