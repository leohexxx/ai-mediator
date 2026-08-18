var test = require('node:test');
var assert = require('node:assert/strict');
var intelligence = require('../services/evidenceIntelligence');
var knowledgeBase = require('../services/knowledgeBase');
var contract = require('../services/analysisContract');

function batch(party, revision, messages, blocks) {
  return {
    _id: party + '-' + revision,
    party: party,
    revision: revision,
    parsedMessages: messages,
    ocrBlocks: blocks || [],
    rawText: messages.map(function (message) { return message.content; }).join('\n'),
  };
}

test('规则引擎提取明确事实并在发送模型前脱敏', function () {
  var batches = [
    batch('party_a', 1, [
      { speaker: '甲方', content: '我答应明天转给你 500 元，手机号 13812345678', timestamp: '2026-08-18 10:00', type: 'text' },
      { speaker: '乙方', content: '你确认周三之前可以吗？', timestamp: '2026-08-18 10:05', type: 'text' },
      { speaker: '甲方', content: '可以，我会处理', timestamp: '2026-08-18 10:06', type: 'text' },
      { speaker: '乙方', content: '收到', timestamp: '2026-08-18 10:07', type: 'text' },
    ], [{ confidence: 96 }, { confidence: 92 }]),
  ];
  var result = intelligence.analyzeEvidence(batches, [
    { name: '甲方', role: 'party_a' }, { name: '乙方', role: 'party_b' },
  ], ['party_a', 'party_b'], false);
  assert.equal(result.route, 'llm');
  assert.equal(result.features.messageCount, 4);
  assert.equal(result.features.partyMessageCounts.party_a, 2);
  assert.ok(result.facts.some(function (fact) { return fact.type === 'amount'; }));
  assert.ok(result.facts.some(function (fact) { return fact.type === 'commitment'; }));
  assert.equal(JSON.stringify(result.excerpts).indexOf('13812345678'), -1);
  assert.ok(JSON.stringify(result.excerpts).indexOf('[手机号已脱敏]') !== -1);
});

test('单方证据置信度有服务端上限且安全内容走确定性分流', function () {
  var messages = [
    { speaker: '我', content: '他威胁要把我打死', timestamp: null, type: 'text' },
    { speaker: '我', content: '我现在很害怕', timestamp: null, type: 'text' },
    { speaker: '对方', content: '你等着', timestamp: null, type: 'text' },
  ];
  var result = intelligence.analyzeEvidence([batch('party_a', 1, messages)], [], ['party_a'], false);
  assert.equal(result.route, 'safety');
  assert.ok(result.quality.score <= 68);
  var kb = knowledgeBase.retrieve({ contributors: ['party_a'], risks: result.risks, facts: result.facts });
  assert.ok(kb.some(function (item) { return item.category === 'safety'; }));
  var report = contract.deterministicReport({ intelligence: result, knowledge: kb }, 'safety');
  assert.match(report.coreConclusion.oneLineVerdict, /安全/);
  assert.equal(report.coreConclusion.overallWinner, 'tie');
});

test('模型输出校验会删除不存在的证据引用并使用后端置信度', function () {
  var result = intelligence.analyzeEvidence([batch('party_a', 1, [
    { speaker: '我', content: '我会明天处理', timestamp: null, type: 'text' },
    { speaker: '对方', content: '请明确时间', timestamp: null, type: 'text' },
    { speaker: '我', content: '明天下午', timestamp: null, type: 'text' },
  ])], [], ['party_a'], false);
  var normalized = contract.normalize({
    coreConclusion: { oneLineVerdict: '双方需要确认期限', confidence: 99, nextActions: ['确认具体日期'] },
    evidenceWeights: [
      { sourceMessageId: 'r1m1', content: '真实引用', weight: 80 },
      { sourceMessageId: 'invented-id', content: '编造引用', weight: 100 },
    ],
  }, { intelligence: result, knowledge: [] });
  assert.equal(normalized.evidenceWeights.length, 1);
  assert.equal(normalized.evidenceWeights[0].sourceMessageId, 'r1m1');
  assert.equal(normalized.coreConclusion.confidence, result.quality.score);
});

test('JSON解析器忽略代码块说明并找到完整对象', function () {
  var parsed = contract.parse('说明文字\n```json\n{"text":"包含 } 字符", "nested":{"ok":true}}\n```');
  assert.equal(parsed.nested.ok, true);
});
