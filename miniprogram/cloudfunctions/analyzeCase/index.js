// ═══════════════════════════════════════════════
// analyzeCase 云函数 (v2 - 支持单人模式)
// 职责: 合并证据 → formatChatForLLM → analyzeChat → 写入 analyses + 更新 cases.status
// 单人模式: party_b 未提交时仅用甲方证据分析, confidence 自动降 15%
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var parser = require('./common/parser');
var llm = require('./common/llm');

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

    // 权限校验: 支持单人模式下 party_b 可能为 null
    var hasPartyB = caseData.party_b && caseData.party_b.openid;
    var isParticipant = caseData.party_a.openid === openid ||
      (hasPartyB && caseData.party_b.openid === openid);

    if (!isParticipant) {
      return { code: -1, data: null, message: '无权操作此案例' };
    }

    // 检查状态
    if (caseData.status === 'analyzing') {
      return { code: -1, data: null, message: '分析正在进行中，请稍候...' };
    }

    // 如果已有分析结果，直接返回
    if ((caseData.status === 'completed' || caseData.status === 'single_completed') && caseData.analysisId) {
      return {
        code: 0,
        data: { analysisId: caseData.analysisId, status: caseData.status },
        message: '分析已完成',
      };
    }

    // ===== 提交状态检查 (v2: 支持单人模式) =====
    var partyASubmitted = caseData.party_a && caseData.party_a.submitted;
    var partyBSubmitted = hasPartyB && caseData.party_b.submitted;
    var isSingleMode = !partyBSubmitted;

    if (!partyASubmitted) {
      return { code: -1, data: null, message: '请先上传聊天记录再开始分析' };
    }

    // 单人模式: 仅用甲方证据
    // 双人模式: 需要双方都提交 (保留原有逻辑)
    var mode = isSingleMode ? 'single' : 'dual';

    var now = new Date().toISOString();

    // 1. 创建分析记录（初始状态）
    var initialMessage = isSingleMode
      ? '单人模式分析中，置信度将自动调整...'
      : '正在准备分析...';

    var analysisResult = await db.collection('analyses').add({
      data: {
        caseId: caseId,
        schemaVersion: 'v2',
        mode: mode,
        coreConclusion: null,
        evidenceWeights: [],
        emotionCurve: [],
        mediationStrategy: [],
        detailedAnalysis: null,
        advice: null,
        progress: {
          step: 'parsing',
          message: initialMessage,
          progress: 0,
        },
        shareCount: 0,
        createdAt: now,
      },
    });

    var analysisId = analysisResult._id;

    // 2. 更新案例状态为 analyzing (单人模式也用 analyzing)
    var newStatus = 'analyzing';
    await db.collection('cases').doc(caseId).update({
      data: {
        status: newStatus,
        analysisId: analysisId,
        updatedAt: now,
      },
    });

    // 3. 获取证据
    var evidenceA = await db.collection('evidence')
      .where({ caseId: caseId, party: 'party_a' })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    var messagesA = (evidenceA.data.length > 0 && evidenceA.data[0].parsedMessages) || [];

    var allMessages = [];
    for (var i = 0; i < messagesA.length; i++) {
      allMessages.push(messagesA[i]);
    }

    // 双人模式: 合并乙方证据
    if (!isSingleMode) {
      var evidenceB = await db.collection('evidence')
        .where({ caseId: caseId, party: 'party_b' })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      var messagesB = (evidenceB.data.length > 0 && evidenceB.data[0].parsedMessages) || [];
      for (var j = 0; j < messagesB.length; j++) {
        allMessages.push(messagesB[j]);
      }
    }

    // 按时间排序
    allMessages.sort(function (a, b) {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return a.timestamp.localeCompare(b.timestamp);
    });

    // 进度回调：写入数据库
    function onProgress(step, progress) {
      var baseMessages = {
        'understanding': '正在理解对话上下文...',
        'evidence': '正在提取关键证据...',
        'emotion': '正在分析情绪变化...',
        'judging': '正在综合判断...',
        'strategy': '正在制定建议策略...',
        'done': '分析完成',
      };

      var singleSuffix = isSingleMode ? ' (单人模式)' : '';
      var message = (baseMessages[step] || '分析中...') + singleSuffix;

      db.collection('analyses').doc(analysisId).update({
        data: {
          progress: {
            step: step,
            message: message,
            progress: progress,
          },
        },
      }).catch(function (err) {
        console.error('更新进度失败:', err);
      });
    }

    // 4. 格式化聊天记录
    var parties = [
      { name: caseData.party_a.nickname || '甲方', role: 'party_a' },
    ];

    if (!isSingleMode) {
      parties.push({
        name: (caseData.party_b && caseData.party_b.nickname) || '乙方',
        role: 'party_b',
      });
    } else {
      // 单人模式: 从对话中自动识别的对方作为 party_b
      parties.push({ name: '对方', role: 'other_party' });
    }

    var formattedChat = parser.formatChatForLLM(allMessages, parties);

    // 案件背景
    var caseContext = '关系: ' + (caseData.relationship || '未设置') +
      '\\n案例标题: ' + (caseData.title || '调解案例') +
      (isSingleMode ? '\\n模式: 单人分析（仅一方提供证据）' : '');

    // 5. 调用 LLM 分析
    onProgress('understanding', 20);

    var analysis;
    try {
      analysis = await llm.analyzeChat(formattedChat, parties, caseContext, onProgress);
    } catch (llmErr) {
      console.error('LLM 分析失败:', llmErr);

      await db.collection('analyses').doc(analysisId).update({
        data: {
          progress: {
            step: 'error',
            message: '分析失败: ' + llmErr.message,
            progress: 0,
          },
        },
      });

      // 恢复状态
      await db.collection('cases').doc(caseId).update({
        data: {
          status: isSingleMode ? 'single_submitted' : 'waiting_submission',
          updatedAt: new Date().toISOString(),
        },
      });

      return { code: -1, data: null, message: 'AI 分析失败: ' + llmErr.message };
    }

    // 6. 单人模式: 调整置信度
    if (isSingleMode && analysis.coreConclusion) {
      var originalConfidence = analysis.coreConclusion.confidence || 75;
      analysis.coreConclusion.confidence = Math.max(30, originalConfidence - 15);
      analysis.coreConclusion.confidenceReasons = [
        '(单人视角分析，置信度已自动调低 15%)',
      ].concat(analysis.coreConclusion.confidenceReasons || []);
      analysis.coreConclusion.isSingleParty = true;
    }

    // 7. 写入完整分析结果
    await db.collection('analyses').doc(analysisId).update({
      data: {
        mode: mode,
        coreConclusion: analysis.coreConclusion,
        evidenceWeights: analysis.evidenceWeights || [],
        emotionCurve: analysis.emotionCurve || [],
        mediationStrategy: analysis.mediationStrategy || [],
        detailedAnalysis: analysis.detailedAnalysis,
        advice: analysis.advice || { toA: [], toB: [], toBoth: [] },
        progress: {
          step: 'done',
          message: isSingleMode ? '单人分析完成' : '分析完成',
          progress: 100,
        },
      },
    });

    // 8. 更新案例状态
    var finalStatus = isSingleMode ? 'single_completed' : 'completed';
    await db.collection('cases').doc(caseId).update({
      data: {
        status: finalStatus,
        updatedAt: new Date().toISOString(),
      },
    });

    return {
      code: 0,
      data: {
        analysisId: analysisId,
        status: finalStatus,
        mode: mode,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('analyzeCase error:', error);
    return { code: -1, data: null, message: error.message || '分析失败' };
  }
};
