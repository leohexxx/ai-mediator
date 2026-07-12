// ═══════════════════════════════════════════════
// analyzeCase 云函数
// 职责: 合并双方证据 → formatChatForLLM → analyzeChat → 写入 analyses + 更新 cases.status
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

    // 权限校验
    if (caseData.party_a.openid !== openid && caseData.party_b.openid !== openid) {
      return { code: -1, data: null, message: '无权操作此案例' };
    }

    // 检查状态
    if (caseData.status === 'analyzing') {
      return { code: -1, data: null, message: '分析正在进行中' };
    }
    if (caseData.status === 'completed' && caseData.analysisId) {
      return { code: 0, data: { analysisId: caseData.analysisId, status: 'completed' }, message: '分析已完成' };
    }

    // 检查双方是否都已提交
    if (!caseData.party_a.submitted || !caseData.party_b.submitted) {
      return { code: -1, data: null, message: '双方都需提交证据后才能开始分析' };
    }

    var now = new Date().toISOString();

    // 1. 创建分析记录（初始状态）
    var analysisResult = await db.collection('analyses').add({
      data: {
        caseId: caseId,
        schemaVersion: 'v2',
        coreConclusion: null,
        evidenceWeights: [],
        emotionCurve: [],
        mediationStrategy: [],
        detailedAnalysis: null,
        advice: null,
        progress: {
          step: 'parsing',
          message: '正在准备分析...',
          progress: 0,
        },
        createdAt: now,
      },
    });

    var analysisId = analysisResult._id;

    // 2. 更新案例状态为 analyzing
    await db.collection('cases').doc(caseId).update({
      data: {
        status: 'analyzing',
        analysisId: analysisId,
        updatedAt: now,
      },
    });

    // 3. 获取双方证据
    var evidenceA = await db.collection('evidence')
      .where({ caseId: caseId, party: 'party_a' })
      .get();
    var evidenceB = await db.collection('evidence')
      .where({ caseId: caseId, party: 'party_b' })
      .get();

    var messagesA = (evidenceA.data.length > 0 && evidenceA.data[0].parsedMessages) || [];
    var messagesB = (evidenceB.data.length > 0 && evidenceB.data[0].parsedMessages) || [];

    // 合并双方消息（按 party 标记）
    var allMessages = [];
    for (var i = 0; i < messagesA.length; i++) {
      allMessages.push(messagesA[i]);
    }
    for (var j = 0; j < messagesB.length; j++) {
      allMessages.push(messagesB[j]);
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
      var stepMessages = {
        'understanding': '正在理解对话上下文...',
        'evidence': '正在提取关键证据...',
        'emotion': '正在分析情绪变化...',
        'judging': '正在综合判断...',
        'strategy': '正在制定调解策略...',
        'done': '分析完成',
      };

      db.collection('analyses').doc(analysisId).update({
        data: {
          progress: {
            step: step,
            message: stepMessages[step] || '分析中...',
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
      { name: caseData.party_b.nickname || '乙方', role: 'party_b' },
    ];
    var formattedChat = parser.formatChatForLLM(allMessages, parties);

    // 案件背景
    var caseContext = '关系: ' + (caseData.relationship || '未设置') +
      '\\n案例标题: ' + caseData.title;

    // 5. 调用 LLM 分析
    onProgress('understanding', 20);

    var analysis;
    try {
      analysis = await llm.analyzeChat(formattedChat, parties, caseContext, onProgress);
    } catch (llmErr) {
      console.error('LLM 分析失败:', llmErr);

      // 更新失败状态
      await db.collection('analyses').doc(analysisId).update({
        data: {
          progress: {
            step: 'error',
            message: '分析失败: ' + llmErr.message,
            progress: 0,
          },
        },
      });

      await db.collection('cases').doc(caseId).update({
        data: {
          status: 'waiting_submission',
          updatedAt: new Date().toISOString(),
        },
      });

      return { code: -1, data: null, message: 'AI 分析失败: ' + llmErr.message };
    }

    // 6. 写入完整分析结果
    await db.collection('analyses').doc(analysisId).update({
      data: {
        coreConclusion: analysis.coreConclusion,
        evidenceWeights: analysis.evidenceWeights || [],
        emotionCurve: analysis.emotionCurve || [],
        mediationStrategy: analysis.mediationStrategy || [],
        detailedAnalysis: analysis.detailedAnalysis,
        advice: analysis.advice || { toA: [], toB: [], toBoth: [] },
        progress: {
          step: 'done',
          message: '分析完成',
          progress: 100,
        },
      },
    });

    // 7. 更新案例状态为完成
    await db.collection('cases').doc(caseId).update({
      data: {
        status: 'completed',
        updatedAt: new Date().toISOString(),
      },
    });

    return {
      code: 0,
      data: {
        analysisId: analysisId,
        status: 'completed',
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('analyzeCase error:', error);
    return { code: -1, data: null, message: error.message || '分析失败' };
  }
};
