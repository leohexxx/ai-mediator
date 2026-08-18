// ═══════════════════════════════════════════════
// generateQRCode 云函数
// 职责: 生成带参小程序码（用于邀请乙方扫码加入）
// 注意: 当前使用 placeholder 模拟，实际部署时需开通云调用
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

    // 验证案例存在且用户是甲方
    var caseResult = await db.collection('cases').doc(caseId).get();
    var caseData = caseResult.data;

    if (!caseData) {
      return { code: -1, data: null, message: '案例不存在' };
    }

    if (caseData.party_a.openid !== openid) {
      return { code: -1, data: null, message: '只有发起方可以生成邀请码' };
    }

    // 获取邀请码
    var inviteResult = await db.collection('invitations')
      .where({ caseId: caseId, used: false })
      .get();

    if (inviteResult.data.length === 0) {
      // 生成新的邀请码
      var newCode = String(Math.floor(100000 + Math.random() * 900000));
      var now = new Date().toISOString();

      await db.collection('invitations').add({
        data: {
          caseId: caseId,
          inviteCode: newCode,
          used: false,
          usedBy: null,
          createdAt: now,
        },
      });

      return {
        code: 0,
        data: {
          inviteCode: newCode,
          qrcodeFileID: null,
          qrcodePlaceholder: true,
          message: '小程序码需在微信云开发控制台开通云调用后自动生成',
        },
        message: 'ok',
      };
    }

    var invitation = inviteResult.data[0];

    // 尝试生成小程序码
    try {
      var qrcodeResult = await cloud.openapi.wxacode.getUnlimited({
        scene: invitation.inviteCode,
        page: 'pages/case-detail/case-detail',
        width: 280,
        autoColor: false,
        lineColor: { r: 99, g: 102, b: 241 },
        isHyaline: true,
      });

      // 上传到云存储
      var uploadResult = await cloud.uploadFile({
        cloudPath: 'qrcodes/' + caseId + '_' + Date.now() + '.png',
        fileContent: qrcodeResult.buffer,
      });

      return {
        code: 0,
        data: {
          inviteCode: invitation.inviteCode,
          qrcodeFileID: uploadResult.fileID,
          qrcodePlaceholder: false,
        },
        message: 'ok',
      };
    } catch (apiErr) {
      // 云调用未开通或权限不足，返回 placeholder
      console.warn('小程序码生成失败（可能需要开通云调用）:', apiErr.message);
      return {
        code: 0,
        data: {
          inviteCode: invitation.inviteCode,
          qrcodeFileID: null,
          qrcodePlaceholder: true,
          message: '小程序码生成需要开通云调用权限',
        },
        message: 'ok',
      };
    }
  } catch (error) {
    console.error('generateQRCode error:', error);
    return { code: -1, data: null, message: error.message || '生成小程序码失败' };
  }
};
