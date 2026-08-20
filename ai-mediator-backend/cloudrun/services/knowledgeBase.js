var KNOWLEDGE_VERSION = '2026.08-v1';

var ARTICLES = [
  {
    id: 'kb_facts_needs_request_v1',
    category: 'communication',
    tags: ['general', 'couple', 'family', 'friend', 'colleague'],
    title: '事实、感受、需要、请求四步表达',
    content: '先描述可核对的事实，再表达自己的感受和需要，最后提出具体、可执行、带时间边界的请求。避免把推测当成对方动机。',
  },
  {
    id: 'kb_commitment_v1',
    category: 'agreement',
    tags: ['commitment', 'amount', 'date', 'transaction'],
    title: '把口头承诺变成可核对事项',
    content: '对金额、期限、交付方式和确认方式分别记录；存在分歧时，优先核对原始记录，不用语气强弱代替事实。',
  },
  {
    id: 'kb_boundary_v1',
    category: 'boundary',
    tags: ['couple', 'family', 'threat', 'repeated_contact'],
    title: '边界冲突的处理顺序',
    content: '明确不能接受的行为、可接受的沟通渠道和下一次沟通时间；对方拒绝边界时暂停争辩，优先保存记录并寻求现实支持。',
  },
  {
    id: 'kb_single_party_v1',
    category: 'evidence',
    tags: ['single_party', 'missing_evidence'],
    title: '单方证据的使用边界',
    content: '单方记录只能说明提交者提供的片段，不能证明对方完整立场。报告应列出缺失材料，并把结论表达为暂时解释而不是最终裁决。',
  },
  {
    id: 'kb_safety_urgent_v1',
    category: 'safety',
    tags: ['self_harm', 'violence', 'urgent'],
    title: '紧急安全优先',
    content: '出现人身危险或自伤风险时停止线上争执，优先联系身边可信任的人和当地紧急服务；不要独自前往可能发生冲突的地点。',
  },
  {
    id: 'kb_fraud_v1',
    category: 'safety',
    tags: ['fraud', 'transaction'],
    title: '疑似诈骗的证据与止损',
    content: '停止继续转账，保存账号、订单、聊天和付款记录，通过支付平台和当地警方等正式渠道核实处理。',
  },
  {
    id: 'kb_minor_v1',
    category: 'safety',
    tags: ['minor'],
    title: '涉及未成年人的保护原则',
    content: '避免公开未成年人身份和聊天内容，必要时由监护人、学校或专业机构介入，安全和隐私优先于争议输赢。',
  },
];

function collectTags(context) {
  var tags = { general: true };
  var relationship = String(context.relationship || '').toLowerCase();
  if (/情侣|恋爱|夫妻|伴侣/.test(relationship)) tags.couple = true;
  if (/家人|亲属|父母|家庭/.test(relationship)) tags.family = true;
  if (/同事|工作|职场/.test(relationship)) tags.colleague = true;
  if (/朋友|同学/.test(relationship)) tags.friend = true;
  if ((context.contributors || []).length < 2) tags.single_party = true;
  (context.facts || []).forEach(function (fact) { tags[fact.type] = true; });
  (context.risks || []).forEach(function (risk) { tags[risk.category] = true; tags[risk.level] = true; });
  return tags;
}

function retrieve(context) {
  var tags = collectTags(context || {});
  return ARTICLES.map(function (article) {
    var score = article.tags.reduce(function (sum, tag) { return sum + (tags[tag] ? 1 : 0); }, 0);
    if (article.category === 'safety' && score) score += 3;
    return { article: article, score: score };
  }).filter(function (entry) { return entry.score > 0; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 5)
    .map(function (entry) {
      return {
        id: entry.article.id,
        version: KNOWLEDGE_VERSION,
        category: entry.article.category,
        title: entry.article.title,
        content: entry.article.content,
      };
    });
}

module.exports = { version: KNOWLEDGE_VERSION, retrieve: retrieve, articles: ARTICLES };
