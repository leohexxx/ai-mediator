var llm = require('./llm');
var config = require('../config');
var db = require('./db');
var parser = require('../utils/chatFormatter');

var ANALYSIS_SYSTEM_PROMPT = '你是一位专业的对话争议分析师，同时精通 MBTI 性格类型学和星座性格分析。' +
  '请从聊天记录中分析：核心结论、性格分析、关键证据、情绪轨迹、调解策略和建议。用中文输出 JSON 格式。';

var ANALYSIS_USER_TEMPLATE = '## 案件背景\n{{caseContext}}\n\n## 聊天记录\n{{chatText}}\n\n' +
  '请分析以上聊天记录，输出包含以下字段的 JSON（不要使用 markdown 代码块）：\n' +
  '{\n' +
  '  "coreConclusion": { "overallWinner":"a/b/tie", "scoreA":0, "scoreB":0, "oneLineVerdict":"...", "keyReasons":[], "recommendedAction":"...", "confidence":0, "confidenceReasons":[] },\n' +
  '  "evidenceWeights": [{ "id":"ev_w_1", "speaker":"...", "content":"...", "timestamp":"...", "weight":85, "weightReason":"...", "favors":"a/b/neutral" }],\n' +
  '  "emotionCurve": [{ "speaker":"...", "points":[{ "timestamp":"...", "emotion":"...", "intensity":70, "trigger":"..." }] }],\n' +
  '  "mediationStrategy": [{ "step":1, "title":"...", "description":"...", "target":"a/b/both", "expectedOutcome":"...", "difficulty":"easy/medium/hard" }],\n' +
  '  "detailedAnalysis": { "summary":"...", "relationship":"...", "characters":[], "conflicts":[], "timeline":[] },\n' +
  '  "advice": { "toA":[], "toB":[], "toBoth":[] }\n' +
  '}';

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
  if (!analysis || analysis.status === 'cancel_requested' || analysis.status === 'canceled') {
    throw cancellationError();
  }
  if (leaseOwner && (!analysis.job || analysis.job.leaseOwner !== leaseOwner)) {
    throw cancellationError();
  }
  return analysis;
}

async function evidenceForRevision(caseId, revision) {
  var result = await db.collection('evidence_batches').where({ caseId: caseId }).get();
  var batches = (result.data || []).filter(function (item) {
    return (Number(item.revision) || 1) <= revision && item.status !== 'deleted';
  });
  if (batches.length) return batches;
  var legacy = await db.collection('evidence').where({ caseId: caseId }).get();
  return legacy.data || [];
}

function finalCaseStatus(caseData, analysis) {
  return analysis.mode === 'dual' || (caseData.party_b && caseData.party_b.openid) ? 'completed' : 'single_completed';
}

async function complete(analysisId, result, leaseOwner) {
  var now = new Date().toISOString();
  await db.runTransaction(async function (transaction) {
    var analysisRef = transaction.collection('analyses').doc(analysisId);
    var analysisResult = await analysisRef.get();
    var analysis = analysisResult.data;
    if (!analysis) throw new Error('分析记录不存在');
    if (leaseOwner && (!analysis.job || analysis.job.leaseOwner !== leaseOwner)) {
      throw new Error('分析任务租约已失效');
    }

    var caseRef = transaction.collection('cases').doc(analysis.caseId);
    var caseResult = await caseRef.get();
    var caseData = caseResult.data;
    if (!caseData) throw new Error('案例不存在');

    if (analysis.status === 'cancel_requested' || analysis.status === 'canceled' ||
        caseData.activeAnalysisId !== analysisId || caseData.analysisLock !== true ||
        Number(caseData.lockedEvidenceRevision) !== Number(analysis.lockedEvidenceRevision)) {
      throw cancellationError();
    }

    await analysisRef.update({ data: {
      coreConclusion: result.coreConclusion || {},
      evidenceWeights: result.evidenceWeights || [],
      emotionCurve: result.emotionCurve || [],
      mediationStrategy: result.mediationStrategy || [],
      detailedAnalysis: result.detailedAnalysis || {},
      advice: result.advice || { toA: [], toB: [], toBoth: [] },
      status: 'completed',
      progress: { step: 'done', message: '分析完成', progress: 100 },
      'job.leaseOwner': null,
      'job.leaseUntil': null,
      completedAt: now,
      'timings.completedAt': now,
      updatedAt: now,
    } });

    // 新分析已取代旧分析时，不允许旧任务覆盖案件状态。
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

async function run(analysisId, options) {
  options = options || {};
  var analysisResult = await db.collection('analyses').doc(analysisId).get();
  var analysis = analysisResult.data;
  if (!analysis) throw new Error('分析记录不存在');

  var caseResult = await db.collection('cases').doc(analysis.caseId).get();
  var caseData = caseResult.data;
  if (!caseData) throw new Error('案例不存在');

  var startedAtMs = Date.now();
  analysis = await assertNotCanceled(analysisId, options.leaseOwner);

  await updateProgress(analysisId, 'formatting', '正在格式化聊天记录...', 10);
  var batches = await evidenceForRevision(analysis.caseId, Number(analysis.lockedEvidenceRevision) || 1);
  var allMessages = [];
  batches.forEach(function (batch) {
    if (batch.parsedMessages) allMessages = allMessages.concat(batch.parsedMessages);
  });
  if (!allMessages.length) throw new Error('尚未提交有效证据');
  allMessages.sort(function (a, b) { return (a.timestamp || '').localeCompare(b.timestamp || ''); });

  var hasPartyB = caseData.party_b && caseData.party_b.openid;
  var parties = [{ name: caseData.party_a.nickname || '甲方', role: 'party_a' }];
  parties.push(hasPartyB
    ? { name: caseData.party_b.nickname || '乙方', role: 'party_b' }
    : { name: '对方', role: 'other_party' });

  var formatted = parser.formatChatForLLM(allMessages, parties);
  var caseContext = '关系: ' + (caseData.relationship || '未设置') + '\n案例标题: ' + (caseData.title || '调解案例');
  var chatText = formatted;
  if (formatted.length > 8000) {
    await updateProgress(analysisId, 'compressing', '正在压缩长文本...', 20);
    chatText = await llm.chatCompletion(
      '请压缩以下聊天记录，保留关键对话原文（说话人+时间戳），压缩为 1/3 长度。输出纯净文本。',
      [{ role: 'user', content: formatted }], 2048
    );
  }

  await assertNotCanceled(analysisId, options.leaseOwner);
  await updateProgress(analysisId, 'analyzing', '正在分析性格与综合判断...', 40);
  var model = analysis.deep ? config.llm.deepModel : config.llm.model;
  var analysisText = await llm.chatCompletion(ANALYSIS_SYSTEM_PROMPT, [{
    role: 'user',
    content: ANALYSIS_USER_TEMPLATE.replace('{{caseContext}}', caseContext).replace('{{chatText}}', chatText),
  }], analysis.deep ? 8192 : 4096, model);

  await assertNotCanceled(analysisId, options.leaseOwner);
  await updateProgress(analysisId, 'parsing', '正在提取证据与情绪...', 70);
  var jsonMatch = analysisText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM 返回格式异常，未找到 JSON');
  var result = JSON.parse(jsonMatch[0]);
  if (analysis.singlePartyEvidence && result.coreConclusion) {
    result.coreConclusion.confidence = Math.max(30, (result.coreConclusion.confidence || 75) - 15);
    result.coreConclusion.confidenceReasons = ['(当前仅一方提交证据，置信度已自动调低 15%)']
      .concat(result.coreConclusion.confidenceReasons || []);
    result.coreConclusion.isSinglePartyEvidence = true;
  }

  await db.collection('analyses').doc(analysisId).update({ data: {
    'timings.modelAndParseMs': Date.now() - startedAtMs,
    model: model,
    updatedAt: new Date().toISOString(),
  } });
  await assertNotCanceled(analysisId, options.leaseOwner);
  await updateProgress(analysisId, 'finalizing', '正在制定调解策略...', 90);
  await complete(analysisId, result, options.leaseOwner);
  console.log('[Analyze] complete: ' + analysisId);
}

module.exports = { run: run, complete: complete, finalCaseStatus: finalCaseStatus };
