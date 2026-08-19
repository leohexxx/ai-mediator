var llm = require('./llm');
var config = require('../config');
var db = require('./db');
var metrics = require('./metrics');
var evidenceIntelligence = require('./evidenceIntelligence');
var knowledgeBase = require('./knowledgeBase');
var analysisContract = require('./analysisContract');

var VALID_MBTI = {
  INTJ: true, INTP: true, ENTJ: true, ENTP: true,
  INFJ: true, INFP: true, ENFJ: true, ENFP: true,
  ISTJ: true, ISFJ: true, ESTJ: true, ESFJ: true,
  ISTP: true, ISFP: true, ESTP: true, ESFP: true,
};
var VALID_ZODIAC = {
  aries: true, taurus: true, gemini: true, cancer: true, leo: true, virgo: true,
  libra: true, scorpio: true, sagittarius: true, capricorn: true, aquarius: true, pisces: true,
};
var VALID_ELEMENT = { '火象': true, '土象': true, '风象': true, '水象': true };

var ANALYSIS_SYSTEM_PROMPT = [
  '你是中立的沟通争议分析助手，不是裁判、律师或心理诊断者。',
  '后端已经完成身份归属、消息统计、明确事实提取、证据质量和安全信号检测；不得推翻这些确定性数据。',
  '只依据带 sourceMessageId 的证据片段分析，不得编造未提供的对话、动机、关系或事实。',
  '先区分可核对事实、双方解释和未知信息，再给出共识、争议、缺失证据和可执行下一步。',
  '不要用 MBTI、星座、情绪强弱或表达方式判断事实真伪和责任。',
  '如收到当事人自愿填写的沟通偏好资料，只可据此微调建议的措辞、节奏和沟通渠道；不得将其当作人格诊断或事实依据。',
  '出现安全信号时优先提示现实安全和专业支持，不作医学、法律或违法定性。',
  '仅输出一个合法 JSON 对象，不要输出 Markdown。',
].join('\n');

function analysisTemplate(payload, deep) {
  return [
    '## 分析模式\n' + (deep ? '深度模式：可展开多个相互竞争的解释，但每个解释都要标明不确定性。' : '快速模式：聚焦最重要的三个争议点和下一步行动。'),
    '## 服务端结构化输入（个人敏感字段已脱敏）',
    JSON.stringify(payload),
    '## 输出结构',
    JSON.stringify({
      coreConclusion: {
        overallWinner: 'a/b/tie（仅兼容字段，不要把报告写成输赢裁决）',
        scoreA: 50, scoreB: 50,
        oneLineVerdict: '基于现有证据的中性摘要',
        keyReasons: ['只写有证据支持的理由'],
        recommendedAction: '最优先的一步',
        commonGround: ['双方记录中可以共同确认的内容'],
        disputedIssues: [{ title: '', partyAView: '', partyBView: '', evidenceIds: ['r1m1'], uncertainty: '' }],
        missingEvidence: ['影响判断但当前缺少的材料'],
        nextActions: ['具体、可执行、非对抗的步骤'],
      },
      evidenceWeights: [{ sourceMessageId: 'r1m1', speaker: 'party_a', content: '简短引用', timestamp: '', weight: 70, weightReason: '', favors: 'a/b/neutral' }],
      emotionCurve: [{ speaker: 'party_a', points: [{ timestamp: '', emotion: '', intensity: 50, trigger: '' }] }],
      mediationStrategy: [{ step: 1, title: '', description: '', target: 'a/b/both', expectedOutcome: '', difficulty: 'easy/medium/hard' }],
      detailedAnalysis: { summary: '', relationship: '', characters: [], conflicts: [], timeline: [] },
      advice: { toA: [], toB: [], toBoth: [] },
    }),
    '置信度由后端根据证据质量计算，不要自行生成 confidence。',
  ].join('\n\n');
}

function updateProgress(analysisId, step, message, progress) {
  return db.collection('analyses').doc(analysisId).update({
    data: { progress: { step: step, message: message, progress: progress }, updatedAt: new Date().toISOString() },
  });
}

function cancellationError() {
  var error = new Error('分析已被用户打断');
  error.code = 'ANALYSIS_CANCELED';
  return error;
}

async function assertNotCanceled(analysisId, leaseOwner) {
  var result = await db.collection('analyses').doc(analysisId).get();
  var analysis = result.data;
  if (!analysis || analysis.status === 'cancel_requested' || analysis.status === 'canceled') throw cancellationError();
  if (leaseOwner && (!analysis.job || analysis.job.leaseOwner !== leaseOwner)) throw cancellationError();
  return analysis;
}

async function evidenceForRevision(caseId, revision) {
  var result = await db.collection('evidence_batches').where({ caseId: caseId }).get();
  var batches = (result.data || []).filter(function (item) {
    return (Number(item.revision) || 1) <= revision && item.status !== 'deleted';
  });
  if (batches.length) return batches;
  var legacy = await db.collection('evidence').where({ caseId: caseId }).get();
  return (legacy.data || []).map(function (item) { return Object.assign({}, item, { revision: 1, legacy: true }); });
}

function finalCaseStatus(caseData, analysis) {
  return analysis.mode === 'dual' || (caseData.party_b && caseData.party_b.openid) ? 'completed' : 'single_completed';
}

function resultFields(result) {
  return {
    coreConclusion: result.coreConclusion || {},
    reportSections: result.reportSections || {},
    evidenceWeights: result.evidenceWeights || [],
    emotionCurve: result.emotionCurve || [],
    mediationStrategy: result.mediationStrategy || [],
    detailedAnalysis: result.detailedAnalysis || {},
    advice: result.advice || { toA: [], toB: [], toBoth: [] },
    extractedFacts: result.extractedFacts || [],
    evidenceFeatures: result.evidenceFeatures || {},
    evidenceQuality: result.evidenceQuality || {},
    safetySignals: result.safetySignals || [],
    knowledgeReferences: result.knowledgeReferences || [],
  };
}

async function complete(analysisId, result, leaseOwner, metadata) {
  metadata = metadata || {};
  var now = new Date().toISOString();
  await db.runTransaction(async function (transaction) {
    var analysisRef = transaction.collection('analyses').doc(analysisId);
    var analysisResult = await analysisRef.get();
    var analysis = analysisResult.data;
    if (!analysis) throw new Error('分析记录不存在');
    if (leaseOwner && (!analysis.job || analysis.job.leaseOwner !== leaseOwner)) throw new Error('分析任务租约已失效');
    var caseRef = transaction.collection('cases').doc(analysis.caseId);
    var caseResult = await caseRef.get();
    var caseData = caseResult.data;
    if (!caseData) throw new Error('案例不存在');
    if (analysis.status === 'cancel_requested' || analysis.status === 'canceled' ||
        caseData.activeAnalysisId !== analysisId || caseData.analysisLock !== true ||
        Number(caseData.lockedEvidenceRevision) !== Number(analysis.lockedEvidenceRevision)) throw cancellationError();

    var updateData = Object.assign({}, resultFields(result), {
      status: 'completed',
      progress: { step: 'done', message: metadata.message || '报告已生成', progress: 100 },
      promptVersion: evidenceIntelligence.PROMPT_VERSION,
      knowledgeVersion: knowledgeBase.version,
      cacheKey: metadata.cacheKey || analysis.cacheKey || '',
      cacheHit: metadata.cacheHit === true,
      llmSkippedReason: metadata.llmSkippedReason || '',
      modelUsage: metadata.modelUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      modelAttempts: metadata.modelAttempts || 0,
      'job.leaseOwner': null,
      'job.leaseUntil': null,
      completedAt: now,
      'timings.completedAt': now,
      updatedAt: now,
    });
    await analysisRef.update({ data: updateData });
    if (caseData.analysisId === analysisId && caseData.activeAnalysisId === analysisId) {
      await caseRef.update({ data: {
        status: finalCaseStatus(caseData, analysis),
        analysisLock: false,
        activeAnalysisId: null,
        lockedEvidenceRevision: null,
        updatedAt: now,
      } });
    }
  });
}

function extractCachedResult(analysis) {
  return resultFields(analysis || {});
}

async function findCached(cacheKey, analysisId) {
  var result = await db.collection('analyses').where({ cacheKey: cacheKey }).limit(10).get();
  return (result.data || []).find(function (item) {
    return item._id !== analysisId && item.status === 'completed' && item.promptVersion === evidenceIntelligence.PROMPT_VERSION;
  }) || null;
}

async function callModelCancelable(analysisId, leaseOwner, systemPrompt, messages, maxTokens, model, extraOptions) {
  var controller = new AbortController();
  var timer = setInterval(function () {
    assertNotCanceled(analysisId, leaseOwner).catch(function (error) {
      if (error && error.code === 'ANALYSIS_CANCELED') controller.abort();
    });
  }, 1000);
  try {
    return await llm.chatCompletionDetailed(systemPrompt, messages, maxTokens, model, Object.assign({
      signal: controller.signal,
      temperature: 0.2,
      maxRetries: 2,
    }, extraOptions || {}));
  } catch (error) {
    if (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')) throw cancellationError();
    throw error;
  } finally {
    clearInterval(timer);
  }
}

async function parseWithRepair(analysisId, leaseOwner, response, model) {
  try {
    return { parsed: analysisContract.parse(response.text), usage: response.usage, attempts: response.attempts };
  } catch (parseError) {
    metrics.increment('analysis_json_repairs');
    await updateProgress(analysisId, 'validating', '正在修复并校验报告格式...', 82);
    var repaired = await callModelCancelable(analysisId, leaseOwner,
      '把输入修复为一个合法 JSON 对象。不得新增事实、解释或证据；只修复 JSON 语法。仅输出 JSON。',
      [{ role: 'user', content: String(response.text || '').slice(0, 18000) }],
      4096, model, { temperature: 0, maxRetries: 1 });
    var totalUsage = {
      prompt_tokens: Number(response.usage && response.usage.prompt_tokens || 0) + Number(repaired.usage && repaired.usage.prompt_tokens || 0),
      completion_tokens: Number(response.usage && response.usage.completion_tokens || 0) + Number(repaired.usage && repaired.usage.completion_tokens || 0),
      total_tokens: Number(response.usage && response.usage.total_tokens || 0) + Number(repaired.usage && repaired.usage.total_tokens || 0),
    };
    return { parsed: analysisContract.parse(repaired.text), usage: totalUsage, attempts: response.attempts + repaired.attempts };
  }
}

function queuedAtMilliseconds(analysis) {
  var value = analysis.timings && analysis.timings.queuedAt || analysis.createdAt;
  var parsed = value ? new Date(value).getTime() : Date.now();
  return isFinite(parsed) ? parsed : Date.now();
}

function normalizePersonality(profile) {
  if (!profile || typeof profile !== 'object') return null;
  var normalized = {};
  if (VALID_MBTI[profile.mbti]) normalized.mbti = profile.mbti;
  if (VALID_ZODIAC[profile.zodiac]) normalized.zodiac = profile.zodiac;
  if (VALID_ELEMENT[profile.element]) normalized.element = profile.element;
  return Object.keys(normalized).length ? normalized : null;
}

function communicationPreferences(caseData) {
  return {
    partyA: normalizePersonality(caseData && caseData.party_a && caseData.party_a.personality),
    partyB: normalizePersonality(caseData && caseData.party_b && caseData.party_b.personality),
    usage: '可选沟通偏好参考；只可调整建议表达，不得用于事实、责任或置信度判断。',
  };
}

async function storeTimings(analysisId, analysis, timings) {
  await db.collection('analyses').doc(analysisId).update({ data: {
    'timings.queueMs': Math.max(0, timings.startedAt - queuedAtMilliseconds(analysis)),
    'timings.preprocessMs': timings.preprocessMs || 0,
    'timings.modelMs': timings.modelMs || 0,
    'timings.parseMs': timings.parseMs || 0,
    'timings.totalMs': Date.now() - queuedAtMilliseconds(analysis),
    model: timings.model || '',
    updatedAt: new Date().toISOString(),
  } });
}

async function notifyCompletion(analysisId) {
  if (!config.notificationInternalToken) {
    console.warn('[Analyze] notification token missing; completion notification skipped');
    return;
  }
  await db.callFunction('sendAnalysisNotification', {
    analysisId: analysisId,
    miniprogramState: config.miniprogramState,
    internalToken: config.notificationInternalToken,
  }).catch(function (error) {
    console.warn('[Analyze] completion notification failed:', error.message);
    metrics.increment('analysis_notifications_failed');
  });
}

async function run(analysisId, options) {
  options = options || {};
  var analysisResult = await db.collection('analyses').doc(analysisId).get();
  var analysis = analysisResult.data;
  if (!analysis) throw new Error('分析记录不存在');
  var caseResult = await db.collection('cases').doc(analysis.caseId).get();
  var caseData = caseResult.data;
  if (!caseData) throw new Error('案例不存在');
  var startedAt = Date.now();
  var preprocessStartedAt = Date.now();
  analysis = await assertNotCanceled(analysisId, options.leaseOwner);

  await updateProgress(analysisId, 'formatting', '正在读取锁定的证据版本...', 10);
  var batches = await evidenceForRevision(analysis.caseId, Number(analysis.lockedEvidenceRevision) || 1);
  batches.sort(function (a, b) { return (Number(a.revision) || 1) - (Number(b.revision) || 1); });
  var hasPartyB = caseData.party_b && caseData.party_b.openid;
  var parties = [
    { name: caseData.party_a && caseData.party_a.nickname || '甲方', role: 'party_a' },
    hasPartyB ? { name: caseData.party_b.nickname || '乙方', role: 'party_b' } : { name: '对方', role: 'party_b' },
  ];
  await updateProgress(analysisId, 'extracting', '正在提取可核对事实与证据质量...', 24);
  var intelligence = evidenceIntelligence.analyzeEvidence(batches, parties, analysis.evidenceContributors || [], analysis.deep === true);
  if (!intelligence.features.messageCount) throw new Error('尚未提交有效证据');
  var model = analysis.deep ? config.llm.deepModel : config.llm.model;
  var preferences = communicationPreferences(caseData);
  var cacheKey = evidenceIntelligence.evidenceFingerprint(analysis.caseId, analysis.lockedEvidenceRevision, batches, analysis.deep ? 'deep' : 'quick', model, preferences);
  await db.collection('analyses').doc(analysisId).update({ data: {
    promptVersion: intelligence.promptVersion,
    cacheKey: cacheKey,
    evidenceFeatures: intelligence.features,
    evidenceQuality: intelligence.quality,
    safetySignals: intelligence.risks,
    updatedAt: new Date().toISOString(),
  } });
  var preprocessMs = Date.now() - preprocessStartedAt;

  await assertNotCanceled(analysisId, options.leaseOwner);
  await updateProgress(analysisId, 'quality_gate', '正在检查证据完整度与安全提示...', 34);
  var knowledge = knowledgeBase.retrieve({
    relationship: caseData.relationship,
    contributors: intelligence.features.evidenceContributors,
    facts: intelligence.facts,
    risks: intelligence.risks,
  });
  var context = { intelligence: intelligence, knowledge: knowledge };

  if (intelligence.route !== 'llm') {
    var deterministic = analysisContract.deterministicReport(context, intelligence.route);
    await storeTimings(analysisId, analysis, { startedAt: startedAt, preprocessMs: preprocessMs, model: 'rules-v3' });
    await complete(analysisId, deterministic, options.leaseOwner, {
      cacheKey: cacheKey,
      llmSkippedReason: intelligence.route,
      message: intelligence.route === 'safety' ? '安全提示已生成' : '证据检查已完成',
    });
    metrics.increment('analysis_llm_skipped_' + intelligence.route);
    metrics.increment('analysis_jobs_completed');
    metrics.observe('analysis_total_latency', Date.now() - startedAt);
    await notifyCompletion(analysisId);
    return;
  }

  var cached = await findCached(cacheKey, analysisId);
  if (cached) {
    await updateProgress(analysisId, 'finalizing', '正在复用相同证据版本的报告...', 90);
    await storeTimings(analysisId, analysis, { startedAt: startedAt, preprocessMs: preprocessMs, model: cached.model || model });
    await complete(analysisId, extractCachedResult(cached), options.leaseOwner, {
      cacheKey: cacheKey,
      cacheHit: true,
      message: '已复用相同证据版本的报告',
    });
    metrics.increment('analysis_cache_hits');
    metrics.increment('analysis_jobs_completed');
    metrics.observe('analysis_total_latency', Date.now() - startedAt);
    await notifyCompletion(analysisId);
    return;
  }

  await updateProgress(analysisId, 'retrieving', '正在匹配相关沟通与安全指引...', 40);
  var payload = {
    case: {
      title: String(caseData.title || '沟通案例').slice(0, 100),
      relationship: String(caseData.relationship || '未设置').slice(0, 60),
      evidenceRevision: analysis.lockedEvidenceRevision,
      singlePartyEvidence: intelligence.features.evidenceContributors.length < 2,
      userProvidedContext: batches.map(function (batch) {
        return evidenceIntelligence.redactSensitiveText(batch.note || '').slice(0, 600);
      }).filter(Boolean).slice(-4),
    },
    communicationPreferences: preferences,
    features: intelligence.features,
    evidenceQuality: intelligence.quality,
    extractedFacts: intelligence.facts,
    safetySignals: intelligence.risks,
    evidenceExcerpts: intelligence.excerpts,
    knowledge: knowledge,
  };

  await assertNotCanceled(analysisId, options.leaseOwner);
  await updateProgress(analysisId, 'analyzing', analysis.deep ? '正在进行深度语义分析...' : '正在综合关键争议与行动建议...', 50);
  var modelStartedAt = Date.now();
  var promptMessage = { role: 'user', content: analysisTemplate(payload, analysis.deep === true) };
  var response;
  try {
    response = await callModelCancelable(analysisId, options.leaseOwner, ANALYSIS_SYSTEM_PROMPT, [promptMessage],
      analysis.deep ? 7000 : 3800, model, { maxRetries: analysis.deep ? 1 : 2 });
  } catch (modelError) {
    if (!analysis.deep || !llm.isTransient(modelError) || model === config.llm.model) throw modelError;
    metrics.increment('analysis_deep_model_fallbacks');
    await updateProgress(analysisId, 'analyzing', '深度模型暂时繁忙，正在切换快速模型...', 56);
    model = config.llm.model;
    response = await callModelCancelable(analysisId, options.leaseOwner, ANALYSIS_SYSTEM_PROMPT, [promptMessage],
      4200, model, { maxRetries: 2 });
  }
  var modelMs = Date.now() - modelStartedAt;

  await assertNotCanceled(analysisId, options.leaseOwner);
  await updateProgress(analysisId, 'validating', '正在核对证据引用与报告结构...', 78);
  var parseStartedAt = Date.now();
  var parsed = await parseWithRepair(analysisId, options.leaseOwner, response, model);
  var normalized = analysisContract.normalize(parsed.parsed, context);
  var parseMs = Date.now() - parseStartedAt;
  await storeTimings(analysisId, analysis, { startedAt: startedAt, preprocessMs: preprocessMs, modelMs: modelMs, parseMs: parseMs, model: response.model || model });

  await assertNotCanceled(analysisId, options.leaseOwner);
  await updateProgress(analysisId, 'finalizing', '正在生成证据版本化报告...', 92);
  await complete(analysisId, normalized, options.leaseOwner, {
    cacheKey: cacheKey,
    modelUsage: parsed.usage,
    modelAttempts: parsed.attempts,
  });
  metrics.increment('analysis_jobs_completed');
  metrics.observe('analysis_total_latency', Date.now() - startedAt);
  await notifyCompletion(analysisId);
  console.log('[Analyze] completed analysis ' + analysisId + ' using prompt ' + evidenceIntelligence.PROMPT_VERSION);
}

module.exports = {
  run: run,
  complete: complete,
  finalCaseStatus: finalCaseStatus,
  analysisTemplate: analysisTemplate,
  callModelCancelable: callModelCancelable,
  normalizePersonality: normalizePersonality,
  communicationPreferences: communicationPreferences,
};
