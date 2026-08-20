var crypto = require('crypto');

var PROMPT_VERSION = 'v3.0.0';
var UNKNOWN_SPEAKERS = ['未知', '系统', 'unknown', 'system', ''];

var FACT_RULES = [
  { type: 'amount', pattern: /(?:人民币|[￥¥])?\s*\d+(?:\.\d{1,2})?\s*(?:元|块|万元)/g },
  { type: 'date', pattern: /(?:20\d{2}[年\-/]\d{1,2}[月\-/]\d{1,2}日?|\d{1,2}月\d{1,2}日|(?:今天|明天|后天|周[一二三四五六日天]))/g },
  { type: 'commitment', pattern: /(?:我会|我答应|我保证|我承诺|我来处理|我负责|之前给你|到时给你|会转给你)/g },
  { type: 'confirmation', pattern: /(?:确认|同意|收到|可以|没问题|就这样|说定了)/g },
  { type: 'apology', pattern: /(?:对不起|抱歉|是我的错|我不该|不好意思)/g },
  { type: 'refusal', pattern: /(?:不同意|不接受|不可以|不可能|拒绝|没答应)/g },
];

var RISK_RULES = [
  { category: 'self_harm', level: 'urgent', pattern: /(?:自杀|不想活|结束生命|割腕|跳楼|轻生)/ },
  { category: 'violence', level: 'urgent', pattern: /(?:打死|杀了|弄死|家暴|殴打|掐住|持刀|暴力)/ },
  { category: 'threat', level: 'high', pattern: /(?:威胁|报复|让你后悔|找人弄你|曝光你|堵你|跟踪你)/ },
  { category: 'fraud', level: 'high', pattern: /(?:诈骗|骗钱|刷单|保证金|解冻金|冒充客服)/ },
  { category: 'minor', level: 'high', pattern: /(?:未成年|未满十四|未满14|小学生|初中生)/ },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function redactSensitiveText(input) {
  return String(input || '')
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号已脱敏]')
    .replace(/\b\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx]\b/g, '[身份证号已脱敏]')
    .replace(/\b(?:\d[ -]?){15,19}\b/g, '[账号已脱敏]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已脱敏]')
    .replace(/(?:https?:\/\/|www\.)[^\s]+/gi, '[链接已脱敏]');
}

function buildAliasMap(parties) {
  var aliases = {
    '甲方': 'party_a', '乙方': 'party_b',
    'A': 'party_a', 'B': 'party_b',
  };
  (parties || []).forEach(function (party) {
    if (party && party.name) aliases[String(party.name).trim()] = party.role;
  });
  return aliases;
}

function canonicalSpeaker(message, batch, aliases) {
  var speaker = String(message && message.speaker || '').trim();
  if (aliases[speaker]) return aliases[speaker];
  if (speaker === '我' || speaker === '自己' || speaker === '本人') return batch.party || 'unknown';
  if (speaker === '对方' || speaker === '他' || speaker === '她') {
    if (batch.party === 'party_a') return 'party_b';
    if (batch.party === 'party_b') return 'party_a';
  }
  if (UNKNOWN_SPEAKERS.indexOf(speaker.toLowerCase()) !== -1) return 'unknown';
  return 'unknown';
}

function flattenMessages(batches, parties) {
  var aliases = buildAliasMap(parties);
  var messages = [];
  (batches || []).forEach(function (batch) {
    var revision = Number(batch.revision) || 1;
    (batch.parsedMessages || []).forEach(function (message, index) {
      var content = String(message.content || '').trim();
      if (!content) return;
      messages.push({
        id: 'r' + revision + 'm' + (index + 1),
        revision: revision,
        batchId: batch._id || '',
        uploadedBy: batch.party || 'unknown',
        party: canonicalSpeaker(message, batch, aliases),
        speaker: String(message.speaker || '未知'),
        content: content,
        safeContent: redactSensitiveText(content),
        timestamp: message.timestamp || null,
        type: message.type || 'text',
      });
    });
  });
  return messages;
}

function extractFacts(messages) {
  var facts = [];
  (messages || []).forEach(function (message) {
    FACT_RULES.forEach(function (rule) {
      var matches = message.content.match(rule.pattern) || [];
      if (!matches.length) return;
      facts.push({
        id: 'fact_' + (facts.length + 1),
        type: rule.type,
        party: message.party,
        value: redactSensitiveText(matches.slice(0, 3).join('、')),
        sourceMessageId: message.id,
        excerpt: redactSensitiveText(message.content).slice(0, 180),
        extractionConfidence: rule.type === 'amount' || rule.type === 'date' ? 0.98 : 0.82,
      });
    });
  });
  return facts.slice(0, 80);
}

function detectRisks(messages) {
  var found = {};
  var signals = [];
  (messages || []).forEach(function (message) {
    RISK_RULES.forEach(function (rule) {
      if (!rule.pattern.test(message.content)) return;
      var key = rule.category + ':' + message.id;
      if (found[key]) return;
      found[key] = true;
      signals.push({
        category: rule.category,
        level: rule.level,
        sourceMessageId: message.id,
        excerpt: redactSensitiveText(message.content).slice(0, 120),
      });
    });
  });
  return signals.slice(0, 20);
}

function ocrStats(batches) {
  var values = [];
  (batches || []).forEach(function (batch) {
    (batch.ocrBlocks || []).forEach(function (block) {
      var value = Number(block.confidence);
      if (isFinite(value) && value >= 0) values.push(value);
    });
  });
  if (!values.length) return { blockCount: 0, averageConfidence: 95, lowConfidenceCount: 0 };
  var total = values.reduce(function (sum, value) { return sum + value; }, 0);
  return {
    blockCount: values.length,
    averageConfidence: Math.round(total / values.length * 100) / 100,
    lowConfidenceCount: values.filter(function (value) { return value < 88; }).length,
  };
}

function parseTimestamp(value) {
  if (!value) return null;
  var normalized = String(value).replace(/\//g, '-');
  if (/^\d{1,2}-\d{1,2}\s/.test(normalized)) normalized = new Date().getFullYear() + '-' + normalized;
  var parsed = new Date(normalized.replace(' ', 'T')).getTime();
  return isFinite(parsed) ? parsed : null;
}

function responseStats(messages) {
  var delays = [];
  for (var i = 1; i < messages.length; i++) {
    var previous = messages[i - 1];
    var current = messages[i];
    if (previous.party === 'unknown' || current.party === 'unknown' || previous.party === current.party) continue;
    var previousTime = parseTimestamp(previous.timestamp);
    var currentTime = parseTimestamp(current.timestamp);
    if (previousTime == null || currentTime == null || currentTime < previousTime) continue;
    delays.push(Math.round((currentTime - previousTime) / 60000));
  }
  if (!delays.length) return { samples: 0, averageMinutes: null, longestMinutes: null };
  return {
    samples: delays.length,
    averageMinutes: round(delays.reduce(function (sum, value) { return sum + value; }, 0) / delays.length),
    longestMinutes: Math.max.apply(Math, delays),
  };
}

function calculateQuality(messages, batches, contributors) {
  var total = messages.length;
  var known = messages.filter(function (message) { return message.party !== 'unknown'; }).length;
  var timed = messages.filter(function (message) { return !!message.timestamp; }).length;
  var ocr = ocrStats(batches);
  var evidenceCoverage = total >= 40 ? 100 : total >= 20 ? 82 : total >= 10 ? 65 : total >= 3 ? 42 : 20;
  var speakerAttribution = total ? round(known / total * 100) : 0;
  var timestampCoverage = total ? Math.max(35, round(timed / total * 100)) : 0;
  var bilateralCoverage = (contributors || []).length >= 2 ? 100 : 45;
  var consistency = Math.max(45, 95 - round((total - known) / Math.max(1, total) * 30));
  var score = round(
    evidenceCoverage * 0.30 +
    clamp(ocr.averageConfidence, 0, 100) * 0.20 +
    speakerAttribution * 0.15 +
    bilateralCoverage * 0.20 +
    timestampCoverage * 0.10 +
    consistency * 0.05
  );
  if ((contributors || []).length < 2) score = Math.min(score, 68);
  if (ocr.blockCount && ocr.averageConfidence < 70) score = Math.min(score, 55);
  if (speakerAttribution < 50) score = Math.min(score, 55);
  var reasons = [];
  if ((contributors || []).length < 2) reasons.push('当前只有一方提交证据，无法核对双方叙述');
  if (ocr.blockCount && ocr.averageConfidence < 88) reasons.push('部分 OCR 文字置信度较低，建议先校对原文');
  if (speakerAttribution < 80) reasons.push('部分消息的说话人无法可靠确认');
  if (timestampCoverage < 60) reasons.push('时间信息不完整，无法完整还原先后顺序');
  if (total < 10) reasons.push('有效消息较少，结论只能覆盖当前片段');
  if (!reasons.length) reasons.push('证据数量、说话人和时间信息较完整');
  return {
    score: clamp(score, 20, 95),
    level: score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low',
    reasons: reasons,
    breakdown: {
      evidenceCoverage: evidenceCoverage,
      ocrQuality: round(ocr.averageConfidence),
      speakerAttribution: speakerAttribution,
      bilateralCoverage: bilateralCoverage,
      timestampCoverage: timestampCoverage,
      consistency: consistency,
    },
    ocr: ocr,
  };
}

function messageScore(message, factIds, riskIds, index, total) {
  var score = 0;
  if (factIds[message.id]) score += 8;
  if (riskIds[message.id]) score += 20;
  if (/[？?]/.test(message.content)) score += 3;
  if (message.content.length >= 20 && message.content.length <= 220) score += 2;
  if (index < 4 || index >= total - 4) score += 2;
  return score;
}

function selectExcerpts(messages, facts, risks, deep) {
  var factIds = {};
  var riskIds = {};
  facts.forEach(function (fact) { factIds[fact.sourceMessageId] = true; });
  risks.forEach(function (risk) { riskIds[risk.sourceMessageId] = true; });
  var maxItems = deep ? 100 : 52;
  var maxChars = deep ? 22000 : 10500;
  var ranked = messages.map(function (message, index) {
    return { message: message, index: index, score: messageScore(message, factIds, riskIds, index, messages.length) };
  }).sort(function (a, b) { return b.score - a.score || a.index - b.index; }).slice(0, maxItems)
    .sort(function (a, b) { return a.index - b.index; });
  var chars = 0;
  var selected = [];
  ranked.forEach(function (entry) {
    var content = entry.message.safeContent.slice(0, 360);
    if (chars + content.length > maxChars) return;
    chars += content.length;
    selected.push({
      id: entry.message.id,
      party: entry.message.party,
      timestamp: entry.message.timestamp,
      type: entry.message.type,
      content: content,
    });
  });
  return selected;
}

function analyzeEvidence(batches, parties, contributors, deep) {
  var messages = flattenMessages(batches, parties);
  var facts = extractFacts(messages);
  var risks = detectRisks(messages);
  var quality = calculateQuality(messages, batches, contributors);
  var partyCounts = { party_a: 0, party_b: 0, unknown: 0 };
  var typeCounts = {};
  var characters = 0;
  messages.forEach(function (message) {
    partyCounts[message.party] = (partyCounts[message.party] || 0) + 1;
    typeCounts[message.type] = (typeCounts[message.type] || 0) + 1;
    characters += message.content.length;
  });
  var urgent = risks.some(function (risk) { return risk.level === 'urgent'; });
  var insufficient = messages.length < 3 || (quality.ocr.blockCount && quality.ocr.averageConfidence < 55) || quality.breakdown.speakerAttribution < 30;
  return {
    promptVersion: PROMPT_VERSION,
    features: {
      messageCount: messages.length,
      characterCount: characters,
      partyMessageCounts: partyCounts,
      messageTypeCounts: typeCounts,
      timestampedMessages: messages.filter(function (message) { return !!message.timestamp; }).length,
      responseLatency: responseStats(messages),
      evidenceContributors: contributors || [],
    },
    quality: quality,
    facts: facts,
    risks: risks,
    excerpts: selectExcerpts(messages, facts, risks, deep),
    route: urgent ? 'safety' : insufficient ? 'insufficient' : 'llm',
  };
}

function buildBatchSummary(parsedMessages, party, revision) {
  var messages = parsedMessages || [];
  var typeCounts = {};
  messages.forEach(function (message) { typeCounts[message.type || 'text'] = (typeCounts[message.type || 'text'] || 0) + 1; });
  var important = messages.filter(function (message) {
    return /(?:\d|答应|确认|不同意|对不起|为什么|怎么|钱|时间|今天|明天|周[一二三四五六日天])/.test(message.content || '');
  }).slice(0, 24).map(function (message, index) {
    return '[b' + (revision || 1) + 'm' + (index + 1) + '] ' + redactSensitiveText(message.speaker + ': ' + message.content).slice(0, 260);
  });
  return [
    '上传方: ' + (party || 'unknown'),
    '消息数: ' + messages.length,
    '消息类型: ' + JSON.stringify(typeCounts),
    '关键片段:',
    important.join('\n'),
  ].join('\n').slice(0, 8000);
}

function evidenceFingerprint(caseId, revision, batches, mode, model, supplementalContext) {
  var stable = (batches || []).map(function (batch) {
    return [batch._id || '', Number(batch.revision) || 1, (batch.sourceHashes || []).join(','), String(batch.rawText || '').length].join(':');
  }).join('|');
  var context = supplementalContext ? JSON.stringify(supplementalContext) : '';
  return crypto.createHash('sha256').update([PROMPT_VERSION, caseId, revision, mode, model, stable, context].join('|')).digest('hex');
}

module.exports = {
  PROMPT_VERSION: PROMPT_VERSION,
  analyzeEvidence: analyzeEvidence,
  buildBatchSummary: buildBatchSummary,
  evidenceFingerprint: evidenceFingerprint,
  redactSensitiveText: redactSensitiveText,
  flattenMessages: flattenMessages,
  calculateQuality: calculateQuality,
};
