function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function strings(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') return String(item.title || item.description || item.content || '').trim();
    return '';
  }).filter(Boolean).slice(0, limit || 12);
}

function findBalancedJson(text) {
  var input = String(text || '');
  var start = input.indexOf('{');
  while (start !== -1) {
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = start; i < input.length; i++) {
      var char = input[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) return input.slice(start, i + 1);
      }
    }
    start = input.indexOf('{', start + 1);
  }
  throw new Error('LLM 返回格式异常，未找到完整 JSON');
}

function parse(text) {
  return JSON.parse(findBalancedJson(text));
}

function normalizeDisputes(value, allowedIds) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map(function (item, index) {
    if (typeof item === 'string') return { title: item, partyAView: '', partyBView: '', evidenceIds: [], uncertainty: '需结合原始证据核对' };
    item = item || {};
    var evidenceIds = strings(item.evidenceIds || item.sourceMessageIds, 8).filter(function (id) { return allowedIds[id]; });
    return {
      id: 'dispute_' + (index + 1),
      title: String(item.title || item.issue || '争议点').slice(0, 100),
      partyAView: String(item.partyAView || item.viewA || '').slice(0, 500),
      partyBView: String(item.partyBView || item.viewB || '').slice(0, 500),
      evidenceIds: evidenceIds,
      uncertainty: String(item.uncertainty || '').slice(0, 240),
    };
  });
}

function normalizeEvidenceWeights(value, allowedIds) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).map(function (item, index) {
    item = item || {};
    var sourceMessageId = String(item.sourceMessageId || item.messageId || item.id || '');
    if (!allowedIds[sourceMessageId]) return null;
    return {
      id: 'evidence_' + (index + 1),
      sourceMessageId: sourceMessageId,
      speaker: String(item.speaker || '').slice(0, 40),
      content: String(item.content || '').slice(0, 360),
      timestamp: item.timestamp || null,
      weight: clamp(item.weight || 50, 0, 100),
      weightReason: String(item.weightReason || '').slice(0, 300),
      favors: ['a', 'b', 'neutral'].indexOf(item.favors) !== -1 ? item.favors : 'neutral',
    };
  }).filter(Boolean);
}

function normalizeEmotionCurve(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2).map(function (curve) {
    curve = curve || {};
    return {
      speaker: String(curve.speaker || '').slice(0, 40),
      points: (Array.isArray(curve.points) ? curve.points : []).slice(0, 16).map(function (point) {
        point = point || {};
        return {
          timestamp: point.timestamp || null,
          emotion: String(point.emotion || '平静').slice(0, 30),
          intensity: clamp(point.intensity || 50, 0, 100),
          trigger: String(point.trigger || '').slice(0, 200),
        };
      }),
    };
  });
}

function normalizeStrategies(value, nextActions) {
  var source = Array.isArray(value) && value.length ? value : nextActions;
  return source.slice(0, 8).map(function (item, index) {
    if (typeof item === 'string') item = { title: item, description: item };
    item = item || {};
    return {
      step: index + 1,
      title: String(item.title || '下一步').slice(0, 80),
      description: String(item.description || '').slice(0, 500),
      target: ['a', 'b', 'both'].indexOf(item.target) !== -1 ? item.target : 'both',
      expectedOutcome: String(item.expectedOutcome || '').slice(0, 240),
      difficulty: ['easy', 'medium', 'hard'].indexOf(item.difficulty) !== -1 ? item.difficulty : 'medium',
    };
  });
}

function knowledgeReferences(knowledge) {
  return (knowledge || []).map(function (item) {
    return { id: item.id, version: item.version, category: item.category, title: item.title };
  });
}

function confidenceReasons(intelligence) {
  var breakdown = intelligence.quality.breakdown;
  return intelligence.quality.reasons.concat([
    '证据覆盖 ' + breakdown.evidenceCoverage + '，OCR质量 ' + breakdown.ocrQuality +
      '，说话人识别 ' + breakdown.speakerAttribution + '，双方覆盖 ' + breakdown.bilateralCoverage,
  ]).slice(0, 8);
}

function normalize(raw, context) {
  raw = raw || {};
  var intelligence = context.intelligence;
  var core = raw.coreConclusion || {};
  var report = raw.reportSections || {};
  var allowedIds = {};
  intelligence.excerpts.forEach(function (item) { allowedIds[item.id] = true; });
  var commonGround = strings(core.commonGround || report.commonGround, 8);
  var disputes = normalizeDisputes(core.disputedIssues || report.disputedIssues || (raw.detailedAnalysis && raw.detailedAnalysis.conflicts), allowedIds);
  var missingEvidence = strings(core.missingEvidence || report.missingEvidence, 10);
  var nextActions = strings(core.nextActions || report.nextActions, 8);
  if (!missingEvidence.length) missingEvidence = intelligence.quality.reasons.filter(function (reason) { return /不足|只有|较低|不完整|无法/.test(reason); });
  if (!nextActions.length && core.recommendedAction) nextActions = [String(core.recommendedAction)];
  if (!nextActions.length) nextActions = ['围绕一个可核对的争议点，分别补充原始记录和自己的具体诉求'];
  var winner = ['a', 'b', 'tie'].indexOf(core.overallWinner) !== -1 ? core.overallWinner : 'tie';
  var scoreA = clamp(core.scoreA || 50, 0, 100);
  var scoreB = clamp(core.scoreB || (100 - scoreA), 0, 100);
  var resultCore = {
    overallWinner: winner,
    scoreA: scoreA,
    scoreB: scoreB,
    oneLineVerdict: String(core.oneLineVerdict || report.summary || '已根据现有证据整理双方分歧和下一步建议').slice(0, 500),
    keyReasons: strings(core.keyReasons, 8),
    recommendedAction: String(core.recommendedAction || nextActions[0]).slice(0, 500),
    commonGround: commonGround,
    disputedIssues: disputes,
    missingEvidence: missingEvidence,
    nextActions: nextActions,
    confidence: intelligence.quality.score,
    confidenceLevel: intelligence.quality.level,
    confidenceReasons: confidenceReasons(intelligence),
    confidenceBreakdown: intelligence.quality.breakdown,
    isSinglePartyEvidence: intelligence.features.evidenceContributors.length < 2,
    analysisBasis: {
      messageCount: intelligence.features.messageCount,
      factCount: intelligence.facts.length,
      evidenceContributors: intelligence.features.evidenceContributors,
      promptVersion: intelligence.promptVersion,
    },
    riskNotice: intelligence.risks.length ? '系统检测到需要优先留意的安全信号，请结合原文核对。' : '',
  };
  return {
    coreConclusion: resultCore,
    reportSections: {
      summary: resultCore.oneLineVerdict,
      commonGround: commonGround,
      disputedIssues: disputes,
      missingEvidence: missingEvidence,
      nextActions: nextActions,
    },
    evidenceWeights: normalizeEvidenceWeights(raw.evidenceWeights, allowedIds),
    emotionCurve: normalizeEmotionCurve(raw.emotionCurve),
    mediationStrategy: normalizeStrategies(raw.mediationStrategy || [], nextActions),
    detailedAnalysis: raw.detailedAnalysis && typeof raw.detailedAnalysis === 'object' ? raw.detailedAnalysis : { summary: resultCore.oneLineVerdict, conflicts: disputes },
    advice: raw.advice && typeof raw.advice === 'object' ? raw.advice : { toA: [], toB: [], toBoth: nextActions },
    extractedFacts: intelligence.facts,
    evidenceFeatures: intelligence.features,
    evidenceQuality: intelligence.quality,
    safetySignals: intelligence.risks,
    knowledgeReferences: knowledgeReferences(context.knowledge),
  };
}

function deterministicReport(context, route) {
  var intelligence = context.intelligence;
  var urgent = route === 'safety';
  var raw = {
    coreConclusion: {
      overallWinner: 'tie', scoreA: 50, scoreB: 50,
      oneLineVerdict: urgent
        ? '现有内容可能涉及人身安全风险，应先确认现实安全，再处理争议。'
        : '目前证据质量不足，系统暂不生成倾向性结论。',
      commonGround: [],
      disputedIssues: [],
      missingEvidence: urgent ? ['需要确认相关表达是否代表现实、即时的危险'] : intelligence.quality.reasons,
      nextActions: urgent
        ? ['立即确认当事人当前是否安全', '如存在即时危险，联系身边可信任的人和当地紧急服务', '暂停单独见面和继续激化冲突，保存原始记录']
        : ['先校对低置信度文字和说话人', '补充争议发生前后的连续记录', '双方分别说明希望解决的一个具体问题'],
      keyReasons: urgent ? ['安全风险高于争议归属判断'] : ['证据数量、OCR或说话人信息未达到可靠分析条件'],
    },
  };
  return normalize(raw, context);
}

module.exports = {
  parse: parse,
  normalize: normalize,
  deterministicReport: deterministicReport,
  findBalancedJson: findBalancedJson,
};
