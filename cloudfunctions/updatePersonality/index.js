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

    // 更新性格信息
    if (isPartyA && personalityA !== undefined) {
      // 如果 personalityA 为空对象，清除性格信息
      if (personalityA && Object.keys(personalityA).length === 0) {
        personalityA = null;
      }
      // 清理空值字段
      if (personalityA) {
        for (var key in personalityA) {
          if (!personalityA[key]) delete personalityA[key];
        }
        if (Object.keys(personalityA).length === 0) personalityA = null;
      }
      updateData['party_a.personality'] = personalityA;
    }

    if (isPartyB && personalityB !== undefined) {
      if (personalityB && Object.keys(personalityB).length === 0) {
        personalityB = null;
      }
      if (personalityB) {
        for (var k in personalityB) {
          if (!personalityB[k]) delete personalityB[k];
        }
        if (Object.keys(personalityB).length === 0) personalityB = null;
      }
      updateData['party_b.personality'] = personalityB;
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
