// ═══════════════════════════════════════════════
// updatePersonality 云函数
// 职责: 更新案例中甲/乙方的性格信息 (MBTI / 星座 / 属性)
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var caseId = event.caseId;
    var personalityA = event.personalityA || null;
    var personalityB = event.personalityB || null;

    if (!caseId) {
      return { code: -1, data: null, message: '缺少案例 ID' };
    }

    // 获取案例
    var caseResult = await db.collection('cases').doc(caseId).get();
    var caseData = caseResult.data;

    if (!caseData) {
      return { code: -1, data: null, message: '案例不存在' };
    }

    // 权限校验
    var isPartyA = caseData.party_a.openid === openid;
    var isPartyB = caseData.party_b && caseData.party_b.openid === openid;

    if (!isPartyA && !isPartyB) {
      return { code: -1, data: null, message: '无权操作此案例' };
    }

    var now = new Date().toISOString();
    var updateData = { updatedAt: now };

    // 保存性格信息的辅助函数
    function cleanPersonality(p) {
      if (!p) return null;
      if (Object.keys(p).length === 0) return null;
      for (var key in p) {
        if (!p[key]) delete p[key];
      }
      return Object.keys(p).length > 0 ? p : null;
    }

    // 更新性格信息
    var cleanedA = cleanPersonality(personalityA);
    var cleanedB = cleanPersonality(personalityB);

    // 本人更新自己的性格
    if (isPartyA && personalityA !== undefined) {
      updateData['party_a.personality'] = cleanedA;
    }
    if (isPartyB && personalityB !== undefined) {
      updateData['party_b.personality'] = cleanedB;
    }

    // 单人模式：允许发起方也设置对方的性格（party_b.openid 为空）
    if (isPartyA && personalityB !== undefined && caseData.mode === 'single') {
      updateData['party_b.personality'] = cleanedB;
    }

    await db.collection('cases').doc(caseId).update({ data: updateData });

    // 返回更新后的数据
    var updated = await db.collection('cases').doc(caseId).get();

    return {
      code: 0,
      data: {
        personalityA: (updated.data.party_a && updated.data.party_a.personality) || null,
        personalityB: (updated.data.party_b && updated.data.party_b.personality) || null,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('updatePersonality error:', error);
    return { code: -1, data: null, message: error.message || '更新失败' };
  }
};
