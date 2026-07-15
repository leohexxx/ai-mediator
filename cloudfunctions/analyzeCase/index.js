// ═══════════════════════════════════════════════
// analyzeCase 云函数 (v6 - 绝对可靠的顺序流水线)
// 职责:
//   - 初始调用: 合并证据 → 建新 analysis 记录 → 置 analyzing →
//     返回给前端 → 同步跑完顺序流水线（await）
//   - core/evidence/strategy: 依次执行 LLM 调用，各阶段写 DB 推进度
//   - 末阶段置 completed + 推送
//
// 核心设计：
//   - 不在 handleInitial 里 fire-and-forget（容器可能被回收）
//   由 exports.main 在接收 handleInitial 结果后，await 整个 pipeline
//   - 前端拿到 analysisId 后立即跳转报告页，不等待整个函数返回
//   - 云函数 120s timeout > 流水线 ~30-40s，足够跑完
//   - 各阶段写 DB 进度，前端通过 watch/轮询感知
//   - 不用 cloud.callFunction 自调用（ESOCKETTIMEDOUT 根源）
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var parser = require('./common/parser');
var llm = require('./common/llm');
var personalityUtil = require('./common/personality');
var analysisPrompt = require('./common/prompts/analysisPrompt');

// 卡死判定
var STUCK_MS = 3 * 60 * 1000;

// ── 进度消息 ───────────────────────────────────────
function progressFor(step, isSingleMode) {
  var baseMessages = {
    'parsing': '正在准备分析...',
    'core': '正在分析性格与综合判断...',
    'evidence': '正在提取证据与情绪...',
    'strategy': '正在制定调解策略...',
    'done': '分析完成',
    'error': '分析失败',
  };
  var map = { understanding: 10, core: 40, evidence: 70, strategy: 90, done: 100 };
  var suffix = isSingleMode ? ' (单人模式)' : '';
  return {
    step: step,
    message: (baseMessages[step] || '分析中...') + suffix,
    progress: map[step] != null ? map[step] : 0,
  };
}

function updateProgress(analysisId, step, isSingleMode) {
  return db.collection('analyses').doc(analysisId).update({
    data: { progress: progressFor(step, isSingleMode) },
  }).catch(function (err) { console.error('更新进度失败:', err); });
}

// ── 证据合并 ───────────────────────────────────────
async function getMergedMessages(caseId, isSingleMode) {
  var evidenceA = await db.collection('evidence')
    .where({ caseId: caseId, party: 'party_a' })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  var allMessages = (evidenceA.data.length > 0 && evidenceA.data[0].parsedMessages) || [];
  if (!isSingleMode) {
    var evidenceB = await db.collection('evidence')
      .where({ caseId: caseId, party: 'party_b' })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    var messagesB = (evidenceB.data.length > 0 && evidenceB.data[0].parsedMessages) || [];
    allMessages = allMessages.concat(messagesB);
  }
  allMessages.sort(function (a, b) {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return a.timestamp.localeCompare(b.timestamp);
  });
  return allMessages;
}

function buildPartiesAndContext(caseData, isSingleMode) {
  var hasPartyB = caseData.party_b && caseData.party_b.openid;
  var parties = [{ name: caseData.party_a.nickname || '甲方', role: 'party_a' }];
  if (!isSingleMode) {
    parties.push({ name: (caseData.party_b && caseData.party_b.nickname) || '乙方', role: 'party_b' });
  } else {
    parties.push({ name: '对方', role: 'other_party' });
  }
  var caseContext = '关系: ' + (caseData.relationship || '未设置') +
    '\n案例标题: ' + (caseData.title || '调解案例') +
    (isSingleMode ? '\n模式: 单人分析（仅一方提供证据）' : '');
  var personalityA = caseData.party_a && caseData.party_a.personality;
  var personalityB = caseData.party_b && caseData.party_b.personality;
  if (personalityA || personalityB) {
    caseContext += '\n性格信息:';
    var nameA = (caseData.party_a && caseData.party_a.nickname) || '甲方';
    var nameB = (caseData.party_b && caseData.party_b.nickname) || '乙方';
    var formattedA = personalityUtil.formatPersonalityForPrompt(personalityA, nameA);
    var formattedB = personalityUtil.formatPersonalityForPrompt(personalityB, nameB);
    if (formattedA) caseContext += '\n' + formattedA;
    if (formattedB) caseContext += '\n' + formattedB;
    if (personalityA && personalityB && personalityA.mbti && personalityB.mbti) {
      caseContext += '\n  提示: 结合双方的 MBTI 类型和星座属性，分析性格差异如何影响他们的沟通方式和冲突模式。';
    }
  }
  return { parties: parties, caseContext: caseContext };
}

function modelForStage(stage, deep) {
  if (!deep) return '';
  if (stage === 'core' || stage === 'strategy') {
    return process.env.DEEP_LLM_MODEL || 'deepseek-v4-pro';
  }
  return '';
}

async function isCurrentAnalysis(caseId, analysisId) {
  try {
    var r = await db.collection('cases').doc(caseId).get();
    return r.data && r.data.analysisId === analysisId;
  } catch (_) {
    return false;
  }
}

async function failStage(caseId, analysisId, isSingleMode, err) {
  console.error('阶段失败:', err);
  await db.collection('analyses').doc(analysisId).update({
    data: { progress: { step: 'error', message: '分析失败: ' + (err.message || ''), progress: 0 } },
  }).catch(function () {});
  if (await isCurrentAnalysis(caseId, analysisId)) {
    await db.collection('cases').doc(caseId).update({
      data: { status: isSingleMode ? 'single_submitted' : 'waiting_submission', updatedAt: new Date().toISOString() },
    }).catch(function () {});
  }
}

// ═══════════════════════════════════════════════
// handleInitial — 创建分析记录，立即返回
// ═══════════════════════════════════════════════
async function handleInitial(event, openid) {
  var caseId = event.caseId;
  var force = event.force === true;

  var caseResult = await db.collection('cases').doc(caseId).get();
  var caseData = caseResult.data;
  if (!caseData) return { code: -1, data: null, message: '案例不存在' };

  var hasPartyB = caseData.party_b && caseData.party_b.openid;
  var isParticipant = caseData.party_a.openid === openid || (hasPartyB && caseData.party_b.openid === openid);
  if (!isParticipant) return { code: -1, data: null, message: '无权操作此案例' };

  var partyASubmitted = caseData.party_a && caseData.party_a.submitted;
  if (!partyASubmitted) return { code: -1, data: null, message: '请先上传聊天记录再开始分析' };

  var isSingleMode = !(hasPartyB && caseData.party_b && caseData.party_b.submitted);
  var mode = isSingleMode ? 'single' : 'dual';

  // analyzing 拦截 — 但缩短卡死阈值到 30s，方便用户重试
  if (caseData.status === 'analyzing' && caseData.analysisId && !force) {
    var existing = await db.collection('analyses').doc(caseData.analysisId).get().catch(function () { return { data: null }; });
    var prog = existing.data && existing.data.progress;
    if (existing.data) {
      var updatedAt = new Date(existing.data.updatedAt || existing.data.createdAt || 0).getTime();
      // 30秒内没推进就视为卡死（原来3分钟太长）
      if (Date.now() - updatedAt < 30000 && prog && prog.step !== 'done' && prog.step !== 'error') {
        return { code: -1, data: null, message: '分析正在进行中，请稍候...' };
      }
    }
    console.log('检测到卡死/超时状态，强制重新分析');
  }

  var now = new Date().toISOString();
  var initialMessage = isSingleMode ? '单人模式分析中，置信度将自动调整...' : '正在准备分析...';
  var deep = event.deep === true;

  // 检测是否为补充证据后的重新分析
  // force=true 只发生在重新分析场景（补充证据/修改性格/重试）
  // uploadEvidence 已将状态重置为 single_submitted，所以不能靠状态判断
  // 改用 analysisId 是否存在来检测（uploadEvidence 不会清除它）
  var isReanalysis = force && caseData.analysisId != null;

  var analysisResult = await db.collection('analyses').add({
    data: {
      caseId: caseId, schemaVersion: 'v3', mode: mode, deep: deep,
      coreConclusion: {}, evidenceWeights: [], emotionCurve: [],
      mediationStrategy: [], detailedAnalysis: {},
      advice: { toA: [], toB: [], toBoth: [] },
      progress: { step: 'parsing', message: initialMessage, progress: 0 },
      shareCount: 0, isReanalysis: isReanalysis || false, createdAt: now,
    },
  });
  var analysisId = analysisResult._id;

  await db.collection('cases').doc(caseId).update({
    data: { status: 'analyzing', analysisId: analysisId, updatedAt: now },
  });

  return {
    code: 0,
    data: { analysisId: analysisId, caseId: caseId, status: 'analyzing', mode: mode, isSingleMode: isSingleMode },
    message: 'ok',
  };
}

// ═══════════════════════════════════════════════
// 顺序流水线
// ═══════════════════════════════════════════════
async function runSequentialPipeline(caseId, analysisId) {
  console.log('[pipeline] 开始顺序流水线 analysisId=' + analysisId);
  var r1 = await handleCore(caseId, analysisId, false);
  if (r1.code === -1) { console.error('[pipeline] core失败，中止:', r1.message); return; }
  console.log('[pipeline] core完成');
  var r2 = await handleEvidence(caseId, analysisId);
  if (r2.code === -1) { console.error('[pipeline] evidence失败，中止:', r2.message); return; }
  console.log('[pipeline] evidence完成');
  await handleStrategy(caseId, analysisId, false);
  console.log('[pipeline] 全部完成!');
}

// ═══════════════════════════════════════════════
// core 阶段
// ═══════════════════════════════════════════════
async function handleCore(caseId, analysisId, fallback) {
  var caseResult = await db.collection('cases').doc(caseId).get();
  var caseData = caseResult.data;
  if (!caseData || caseData.analysisId !== analysisId) {
    console.log('core: 非当前分析，中止');
    return { code: 0, message: 'stale' };
  }
  var isSingleMode = caseData.mode === 'single' || !(caseData.party_b && caseData.party_b.openid);
  var analysisDoc = await db.collection('analyses').doc(analysisId).get();
  var deep = analysisDoc.data && analysisDoc.data.deep;
  var usePro = deep && !fallback;

  try {
    await updateProgress(analysisId, 'core', isSingleMode);
    var allMessages = await getMergedMessages(caseId, isSingleMode);
    var pc = buildPartiesAndContext(caseData, isSingleMode);

    // 补充证据重新分析标记 — 注入到 caseContext，会传播到所有阶段
    if (analysisDoc.data && analysisDoc.data.isReanalysis) {
      pc.caseContext += '\n\n【重要】本次为补充证据后的重新分析，请基于最新的完整证据链进行分析，并在结论中明确指出证据是否发生了变化。';
    }

    var formatted = parser.formatChatForLLM(allMessages, pc.parties);

    var chatText = formatted;
    if (formatted.length > analysisPrompt.SUMMARIZE_THRESHOLD) {
      try { chatText = await llm.analyzeChatStage('summarize', formatted, pc.parties, pc.caseContext, null, modelForStage('summarize', deep)); }
      catch (e) { chatText = formatted.slice(0, 16000); }
    }

    var core = await llm.analyzeChatStage('core', chatText, pc.parties, pc.caseContext, null, usePro ? modelForStage('core', deep) : '');

    await db.collection('analyses').doc(analysisId).update({
      data: {
        coreConclusion: core.coreConclusion || {},
        detailedAnalysis: { summary: core.summary || '', relationship: core.relationship || '', characters: core.characters || [], conflicts: [], timeline: [] },
        _input: { chatText: chatText.slice(0, 12000), caseContext: pc.caseContext, parties: pc.parties },
        progress: progressFor('core', isSingleMode),
      },
    });
    return { code: 0, message: 'core done' };
  } catch (err) {
    if (usePro) {
      console.warn('core Pro 失败，降级 Flash 重试:', err.message);
      await db.collection('analyses').doc(analysisId).update({
        data: { progress: { step: 'core', message: '深度模式超时，已切换快速模式重试...', progress: 40 } },
      }).catch(function () {});
      return await handleCore(caseId, analysisId, true);
    }
    await failStage(caseId, analysisId, isSingleMode, err);
    return { code: -1, message: err.message };
  }
}

// ═══════════════════════════════════════════════
// evidence 阶段
// ═══════════════════════════════════════════════
async function handleEvidence(caseId, analysisId) {
  if (!(await isCurrentAnalysis(caseId, analysisId))) { console.log('evidence: 非当前分析，中止'); return { code: 0, message: 'stale' }; }
  var analysisDoc = await db.collection('analyses').doc(analysisId).get();
  var analysis = analysisDoc.data;
  var isSingleMode = analysis.mode === 'single';
  var deep = analysis.deep;
  try {
    await updateProgress(analysisId, 'evidence', isSingleMode);
    var input = analysis._input || {};
    var chatText = input.chatText || '';
    var parties = input.parties || [];
    var caseContext = input.caseContext || '';
    var core = { coreConclusion: analysis.coreConclusion, characters: analysis.detailedAnalysis && analysis.detailedAnalysis.characters };
    var evidence = await llm.analyzeChatStage('evidence', chatText, parties, caseContext, llm.compactPrior(core), modelForStage('evidence', deep));
    await db.collection('analyses').doc(analysisId).update({
      data: {
        evidenceWeights: evidence.evidenceWeights || [], emotionCurve: evidence.emotionCurve || [],
        detailedAnalysis: { summary: (analysis.detailedAnalysis && analysis.detailedAnalysis.summary) || '', relationship: (analysis.detailedAnalysis && analysis.detailedAnalysis.relationship) || '', characters: (analysis.detailedAnalysis && analysis.detailedAnalysis.characters) || [], conflicts: evidence.conflicts || [], timeline: evidence.timeline || [] },
        progress: progressFor('evidence', isSingleMode),
      },
    });
    return { code: 0, message: 'evidence done' };
  } catch (err) {
    await failStage(caseId, analysisId, isSingleMode, err);
    return { code: -1, message: err.message };
  }
}

// ═══════════════════════════════════════════════
// strategy 阶段（末阶段）
// ═══════════════════════════════════════════════
async function handleStrategy(caseId, analysisId, fallback) {
  if (!(await isCurrentAnalysis(caseId, analysisId))) { console.log('strategy: 非当前分析，中止'); return { code: 0, message: 'stale' }; }
  var analysisDoc = await db.collection('analyses').doc(analysisId).get();
  var analysis = analysisDoc.data;
  var isSingleMode = analysis.mode === 'single';
  var deep = analysis.deep;
  var usePro = deep && !fallback;
  try {
    await updateProgress(analysisId, 'strategy', isSingleMode);
    var input = analysis._input || {};
    var chatText = input.chatText || '';
    var parties = input.parties || [];
    var caseContext = input.caseContext || '';
    var prior = { core: { coreConclusion: analysis.coreConclusion, characters: analysis.detailedAnalysis && analysis.detailedAnalysis.characters }, evidence: { evidenceWeights: analysis.evidenceWeights, emotionCurve: analysis.emotionCurve } };
    var strategy = await llm.analyzeChatStage('strategy', chatText, parties, caseContext, llm.compactPrior(prior), usePro ? modelForStage('strategy', deep) : '');
    var coreConclusion = analysis.coreConclusion || {};
    if (isSingleMode && coreConclusion) {
      var originalConfidence = coreConclusion.confidence || 75;
      coreConclusion.confidence = Math.max(30, originalConfidence - 15);
      coreConclusion.confidenceReasons = ['(单人视角分析，置信度已自动调低 15%)'].concat(coreConclusion.confidenceReasons || []);
      coreConclusion.isSingleParty = true;
    }
    await db.collection('analyses').doc(analysisId).update({
      data: {
        coreConclusion: coreConclusion, mediationStrategy: strategy.mediationStrategy || [],
        advice: strategy.advice || { toA: [], toB: [], toBoth: [] },
        progress: { step: 'done', message: isSingleMode ? '单人分析完成' : '分析完成', progress: 100 },
      },
    });
    var finalStatus = isSingleMode ? 'single_completed' : 'completed';
    await db.collection('cases').doc(caseId).update({ data: { status: finalStatus, updatedAt: new Date().toISOString() } });
    try {
      var caseResult2 = await db.collection('cases').doc(caseId).get();
      var caseData2 = caseResult2.data;
      var tout = (caseData2.party_a && caseData2.party_a.openid) || '';
      var ttitle = caseData2.title || '调解案例';
      var oneLineResult2 = (coreConclusion && coreConclusion.oneLineVerdict) || '已完成分析';
      if (oneLineResult2.length > 20) oneLineResult2 = oneLineResult2.substring(0, 20) + '...';
      await cloud.openapi.subscribeMessage.send({
        touser: tout,
        templateId: 'MotJahkp5DN6k66kLHps__sxR25G7yjDfUdCQ4jAj6M',
        page: 'pages/report/report?caseId=' + caseId,
        miniprogramState: 'developer',
        data: { phrase1: { value: '分析完成' }, thing2: { value: ttitle }, thing3: { value: oneLineResult2 } },
      });
    } catch (subErr) { console.warn('订阅消息推送失败:', subErr.message); }
    return { code: 0, message: 'strategy done' };
  } catch (err) {
    if (usePro) {
      console.warn('strategy Pro 失败，降级 Flash 重试:', err.message);
      await db.collection('analyses').doc(analysisId).update({
        data: { progress: { step: 'strategy', message: '深度模式超时，已切换快速模式重试...', progress: 90 } },
      }).catch(function () {});
      return await handleStrategy(caseId, analysisId, true);
    }
    await failStage(caseId, analysisId, isSingleMode, err);
    return { code: -1, message: err.message };
  }
}

// ═══════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  // 启动日志: 打印 LLM 配置（掩码 API key）
  try {
    var cfg = llm.getConfig();
    var maskedKey = cfg.apiKey ? '***' + cfg.apiKey.slice(-6) : '(empty)';
    console.log('[analyzeCase] LLM config: provider=' + cfg.provider + ' model=' + cfg.model + ' baseUrl=' + cfg.baseUrl + ' key=' + maskedKey);
    console.log('[analyzeCase] DEEP_LLM_MODEL=' + (process.env.DEEP_LLM_MODEL || '(not set)'));
  } catch (e) {
    console.warn('[analyzeCase] 无法读取 LLM 配置:', e.message);
  }

  try {
    // 1. handleInitial 创建分析记录，返回结果给前端（立即返回，不等待流水线）
    var initResult = await handleInitial(event, openid);

    // 2. 如果创建成功，同步运行顺序流水线（await 保证容器在 pipeline 跑完前不被回收）
    //    流水线 ~55-64s，云函数 120s timeout 足够
    //    客户端已在导航前发起了 callFunction，不等待返回结果
    if (initResult.code === 0 && initResult.data && initResult.data.analysisId) {
      var caseId = initResult.data.caseId || event.caseId;
      var analysisId = initResult.data.analysisId;
      console.log('[main] handleInitial成功, 同步启动流水线 caseId=' + caseId + ' analysisId=' + analysisId);

      await runSequentialPipeline(caseId, analysisId).catch(function (err) {
        console.error('[main] 流水线执行出错:', err && err.message);
      });

      console.log('[main] 流水线全部完成!');
    }

    return initResult;
  } catch (error) {
    console.error('analyzeCase error:', error);
    return { code: -1, data: null, message: error.message || '分析失败' };
  }
};
