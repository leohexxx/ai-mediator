// ═══════════════════════════════════════════════
// uploadEvidence 云函数 (v3 - 支持补充证据)
// 职责: 接收文本/聊天记录 → parser 解析 → 写入 evidence + 更新提交状态
// 单人模式: 提交后自动触发分析 (autoAnalyze=true)
// supplement=true: 跳过分析状态检查，用于补充证据后重新分析
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var parser = require('./common/parser');
var caseStatus = require('./common/caseStatus');
var STATUS = caseStatus.STATUS;

/**
 * 云函数入口
 * @param {Object} event
 * @param {string} event.caseId - 案例 ID
 * @param {string} event.rawText - 聊天记录原始文本
 * @param {string} [event.note] - 用户备注（可选）
 * @param {string[]} [event.fileIds] - 云存储文件 ID 列表（可选）
 * @param {boolean} [event.supplement] - 是否为补充证据（跳过状态检查）
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var caseId = event.caseId;
    var rawText = event.rawText;
    var note = event.note || '';
    var fileIds = event.fileIds || [];
    var supplement = event.supplement === true;

    if (!caseId) {
      return { code: -1, data: null, message: '缺少案例 ID' };
    }
    if (!rawText || !rawText.trim()) {
      return { code: -1, data: null, message: '请提供聊天记录内容' };
    }

    // 获取案例信息
    var caseResult = await db.collection('cases').doc(caseId).get();
    var caseData = caseResult.data;

    if (!caseData) {
      return { code: -1, data: null, message: '案例不存在' };
    }

    // 确定用户角色 (v2: 支持单人模式)
    var party;
    if (caseData.party_a.openid === openid) {
      party = 'party_a';
    } else if (caseData.party_b && caseData.party_b.openid === openid) {
      party = 'party_b';
    } else {
      return { code: -1, data: null, message: '无权操作此案例' };
    }

    // 检查案例状态（补充证据模式跳过此检查）
    if (!supplement) {
      var invalidStatuses = [STATUS.COMPLETED, STATUS.SINGLE_COMPLETED, STATUS.DUAL_B_SUBMITTED, STATUS.ANALYZING, STATUS.EXPIRED];
      if (invalidStatuses.indexOf(caseData.status) !== -1) {
        return { code: -1, data: null, message: '分析已完成或进行中，无法修改证据' };
      }
    }

    // 解析聊天记录
    var parsedMessages;
    try {
      parsedMessages = parser.parseWeChatChatLog(rawText);
    } catch (parseErr) {
      console.error('parse error:', parseErr);
      return { code: -1, data: null, message: '聊天记录解析失败: ' + parseErr.message };
    }

    if (parsedMessages.length === 0) {
      return { code: -1, data: null, message: '未能解析出有效的聊天消息，请检查格式' };
    }

    var now = new Date().toISOString();

    // 检查是否已有同方证据（覆盖旧证据）
    var existingEvidence = await db.collection('evidence')
      .where({ caseId: caseId, party: party })
      .get();

    if (existingEvidence.data.length > 0) {
      await db.collection('evidence').doc(existingEvidence.data[0]._id).update({
        data: {
          rawText: rawText,
          parsedMessages: parsedMessages,
          fileIds: fileIds,
          note: note,
          updatedAt: now,
        },
      });
    } else {
      await db.collection('evidence').add({
        data: {
          caseId: caseId,
          party: party,
          openid: openid,
          rawText: rawText,
          parsedMessages: parsedMessages,
          fileIds: fileIds,
          note: note,
          createdAt: now,
        },
      });
    }

    // 更新案例提交状态
    var updateData = { updatedAt: now };
    if (party === 'party_a') {
      updateData['party_a.submitted'] = true;
      updateData['party_a.submittedAt'] = now;
      // 单人模式: 提交后状态变为 single_submitted
      // 补充证据: 即使已完成也重置为 single_submitted，以便重新分析
      var isSingle = caseData.mode === 'single' || !caseData.mode;
      if (isSingle) {
        updateData['status'] = caseStatus.assertTransition(caseData.status, STATUS.SINGLE_SUBMITTED);
      }
    } else {
      updateData['party_b.submitted'] = true;
      updateData['party_b.submittedAt'] = now;
    }

    // 补充证据时清除旧分析结果标记，确保重新分析可以执行
    if (supplement) {
      updateData['status'] = caseStatus.assertTransition(caseData.status, STATUS.SINGLE_SUBMITTED);
    }

    // 保留 dual_a_submitted，随后 analyzeCase 才能识别这是乙方辩论提交；
    // analyzing 状态由 analyzeCase 在真正创建分析记录后写入。
    var isDebateSubmission = caseData.mode === 'dual' && caseData.status === STATUS.DUAL_A_SUBMITTED && party === 'party_b';

    await db.collection('cases').doc(caseId).update({ data: updateData });

    // 重新获取案例判断是否需要自动触发分析
    var updatedCase = await db.collection('cases').doc(caseId).get();
    var updatedData = updatedCase.data;

    var autoAnalyze = false;

    // 双人模式基础判定
    var hasPartyB = updatedData.party_b && updatedData.party_b.openid;

    // 双人模式: 甲方已提交且乙方已加入 → 允许自动分析（新增）
    var canAutoAnalyzeDualA = updatedData.mode === 'dual' && party === 'party_a' && updatedData.party_a.submitted && hasPartyB;

    // 双人模式: 辩论场景 — 乙方在 dual_a_submitted 下补充（新增）
    var canAutoAnalyzeDebate = isDebateSubmission;

    // 双人模式: 双方都已提交 → 自动分析（现有）
    var canAutoAnalyzeBoth = hasPartyB && updatedData.party_a.submitted && updatedData.party_b.submitted;

    // 单人模式: 甲方已提交 → 自动分析（现有）
    var isSingleMode = updatedData.mode === 'single' || (!hasPartyB);
    var canAutoAnalyzeSingle = isSingleMode && updatedData.party_a.submitted;

    autoAnalyze = canAutoAnalyzeDualA || canAutoAnalyzeDebate || canAutoAnalyzeBoth || canAutoAnalyzeSingle;

    return {
      code: 0,
      data: {
        messageCount: parsedMessages.length,
        party: party,
        autoAnalyze: autoAnalyze,
        isSingleMode: isSingleMode,
        updatedAt: now,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('uploadEvidence error:', error);
    return { code: -1, data: null, message: error.message || '上传证据失败' };
  }
};
