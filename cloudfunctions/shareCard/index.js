// ═══════════════════════════════════════════════
// shareCard 云函数
// 职责: 获取分析结果 + 生成带参小程序码 → 返回卡片数据
// 小程序端接收卡片数据后用 Canvas 2D 绘制分享图片
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

/**
 * 云函数入口
 * @param {Object} event
 * @param {string} event.caseId - 案例 ID
 * @param {'verdict'|'fun'|'suspense'|'compare'} [event.template='verdict'] - 卡片模板
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var caseId = event.caseId;
    var template = event.template || 'verdict';

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
    var isParticipant = caseData.party_a.openid === openid ||
      (caseData.party_b && caseData.party_b.openid === openid);

    if (!isParticipant) {
      return { code: -1, data: null, message: '无权操作此案例' };
    }

    // 获取分析结果
    var analysisId = caseData.analysisId;
    if (!analysisId) {
      // 尝试从 analyses 集合中查找
      var analysisQuery = await db.collection('analyses')
        .where({ caseId: caseId })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (analysisQuery.data.length === 0) {
        return { code: -1, data: null, message: '分析结果尚未生成' };
      }
      analysisId = analysisQuery.data[0]._id;
    }

    var analysisResult = await db.collection('analyses').doc(analysisId).get();
    var analysis = analysisResult.data;

    if (!analysis || !analysis.coreConclusion) {
      return { code: -1, data: null, message: '分析结果数据不完整' };
    }

    // 生成带参小程序码
    var qrcodeFileID = null;
    try {
      var qrcodeResult = await cloud.openapi.wxacode.getUnlimited({
        scene: 'share_' + caseId,
        page: 'pages/report/report',
        width: 280,
        checkPath: false,
      });

      if (qrcodeResult && qrcodeResult.buffer) {
        var uploadResult = await cloud.uploadFile({
          cloudPath: 'share/qrcode_' + caseId + '_' + Date.now() + '.png',
          fileContent: qrcodeResult.buffer,
        });
        qrcodeFileID = uploadResult.fileID;
      }
    } catch (qrErr) {
      console.warn('生成小程序码失败, 将使用备用方案:', qrErr.message);
      // 小程序码生成失败不影响卡片数据返回
    }

    // 获取当事人昵称
    var partyAName = (caseData.party_a && caseData.party_a.nickname) || '甲方';
    var partyBName = '对方';
    if (caseData.party_b && caseData.party_b.nickname) {
      partyBName = caseData.party_b.nickname;
    }

    var core = analysis.coreConclusion;

    // 构造卡片数据
    var cardData = {
      template: template,
      caseTitle: caseData.title || '调解案例',
      relation: caseData.relationship || '',
      mode: analysis.mode || 'single',

      // 核心裁决数据
      scoreA: core.scoreA || 50,
      scoreB: core.scoreB || 50,
      winner: core.overallWinner || 'tie',
      verdict: core.oneLineVerdict || '',
      keyReasons: (core.keyReasons || []).slice(0, 2),
      confidence: core.confidence || 75,
      isSingleParty: core.isSingleParty || analysis.mode === 'single',

      // 当事人昵称
      partyAName: partyAName,
      partyBName: partyBName,

      // 小程序码
      qrcodeFileID: qrcodeFileID,
      caseId: caseId,
    };

    // 更新分享计数
    db.collection('analyses').doc(analysisId).update({
      data: {
        shareCount: db.command.inc(1),
      },
    }).catch(function () { /* 非关键操作 */ });

    // 缓存卡片数据
    var cacheResult = await db.collection('share_cards').add({
      data: {
        caseId: caseId,
        template: template,
        cardData: cardData,
        qrcodeFileID: qrcodeFileID,
        openCount: 0,
        createdAt: new Date().toISOString(),
      },
    });

    return {
      code: 0,
      data: {
        cardId: cacheResult._id,
        cardData: cardData,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('shareCard error:', error);
    return { code: -1, data: null, message: error.message || '生成分享卡片失败' };
  }
};
