// ═══════════════════════════════════════════════
// 星座属性映射 + MBTI 性格描述 (云函数 CommonJS 版)
// ═══════════════════════════════════════════════

var ZODIAC_LIST = [
  { label: '白羊座', value: 'aries', element: '火象', date: '3.21-4.19',
    traits: '直率、冲动、行动力强，在冲突中倾向于直接表达不满，不擅长隐藏情绪' },
  { label: '金牛座', value: 'taurus', element: '土象', date: '4.20-5.20',
    traits: '固执、稳定、重视安全感，冲突时容易冷战，不轻易改变立场' },
  { label: '双子座', value: 'gemini', element: '风象', date: '5.21-6.21',
    traits: '善于沟通但善变，冲突中倾向于用理性辩论，可能回避深层情感' },
  { label: '巨蟹座', value: 'cancer', element: '水象', date: '6.22-7.22',
    traits: '敏感、念旧、情绪化，冲突中容易受伤和退缩，需要情感安全感' },
  { label: '狮子座', value: 'leo', element: '火象', date: '7.23-8.22',
    traits: '骄傲、大方、需要被认可，冲突中不甘示弱，但内心渴望被理解' },
  { label: '处女座', value: 'virgo', element: '土象', date: '8.23-9.22',
    traits: '追求完美、注重细节，冲突中可能显得挑剔，实则想帮对方改进' },
  { label: '天秤座', value: 'libra', element: '风象', date: '9.23-10.23',
    traits: '追求和谐、优柔寡断，冲突中会努力寻求公平，但可能回避真正的问题' },
  { label: '天蝎座', value: 'scorpio', element: '水象', date: '10.24-11.22',
    traits: '深情而极端、洞察力强，冲突时情绪激烈，不轻易原谅背叛' },
  { label: '射手座', value: 'sagittarius', element: '火象', date: '11.23-12.21',
    traits: '热爱自由、乐观直接，冲突中容易不耐烦，需要个人空间' },
  { label: '摩羯座', value: 'capricorn', element: '土象', date: '12.22-1.19',
    traits: '务实、隐忍、责任感强，冲突中倾向于压抑情绪，用行动而非语言表达' },
  { label: '水瓶座', value: 'aquarius', element: '风象', date: '1.20-2.18',
    traits: '独立理性、追求独特，冲突中可能显得冷漠疏离，实则需要被真正理解' },
  { label: '双鱼座', value: 'pisces', element: '水象', date: '2.19-3.20',
    traits: '浪漫感性、共情力强，冲突中容易自我牺牲或逃避现实，需要温柔对待' },
];

// MBTI 16 型在亲密关系中的简短特质
var MBTI_TRAITS = {
  'INTJ': '建筑师型：理性独立、有战略思维，倾向于用逻辑解决问题而非情感安慰，在关系中需要智力上的共鸣和独处空间，可能因过于理性而显得冷漠',
  'INTP': '逻辑学家型：好奇、善于分析，倾向于把关系也当作问题来"解决"，可能忽略对方的情感需求，需要被鼓励表达感受',
  'ENTJ': '指挥官型：果断、有领导力，在关系中喜欢掌控方向，可能因过度强势而让对方感到压迫，需要学会倾听和让步',
  'ENTP': '辩论家型：机智、善于辩论，喜欢探讨各种可能性，在冲突中可能用理性论辩回避情感层面，需要正视情绪',
  'INFJ': '提倡者型：理想主义、深富同理心，对关系质量要求极高，渴望深度连接，但容易因期望落差而受伤',
  'INFP': '调停者型：温柔、理想化，重视价值观一致性，在冲突中容易退缩和自责，需要明确的肯定和安全感',
  'ENFJ': '主人公型：热情、善于激励他人，在关系中高度关注对方需求，但可能过度付出导致失衡，需要学会表达自己的底线',
  'ENFP': '竞选家型：热情、富有创意，渴望新鲜感，在关系中需要持续的刺激和情感共鸣，可能因注意力分散让对方觉得不够专注',
  'ISTJ': '物流师型：务实、可靠、重视承诺，在关系中用行动证明爱意而非言语，在冲突时倾向于回避而非正面沟通',
  'ISFJ': '守护者型：温暖、忠诚、体贴入微，在关系中默默付出，但可能压抑自己需求以避免冲突，需要被鼓励表达',
  'ESTJ': '总经理型：高效、负责、重视秩序，在关系中期望对方遵守规则和承诺，可能因过于严格让对方感到压力',
  'ESFJ': '执政官型：热心、尽责、重视和谐，在关系中高度关注对方的日常需求，但可能因过度操心而焦虑',
  'ISTP': '鉴赏家型：冷静、务实、喜欢动手解决具体问题，在关系中不善言辞和情感表达，需要对方理解其"行动即关心"的方式',
  'ISFP': '探险家型：温柔、随性、重视个人空间，在关系中追求自然舒适的氛围，回避冲突和紧张讨论',
  'ESTP': '企业家型：大胆、务实、活在当下，在关系中直接坦率，但可能因冲动言行伤害对方感受',
  'ESFP': '表演家型：活泼、热情、享受当下，在关系中擅长制造快乐，但面对深层冲突容易逃避或转移话题',
};

function getElementByZodiac(zodiacValue) {
  for (var i = 0; i < ZODIAC_LIST.length; i++) {
    if (ZODIAC_LIST[i].value === zodiacValue) return ZODIAC_LIST[i].element;
  }
  return '';
}

function getZodiacLabel(value) {
  for (var i = 0; i < ZODIAC_LIST.length; i++) {
    if (ZODIAC_LIST[i].value === value) return ZODIAC_LIST[i].label;
  }
  return '';
}

function getZodiacTraits(zodiacValue) {
  for (var i = 0; i < ZODIAC_LIST.length; i++) {
    if (ZODIAC_LIST[i].value === zodiacValue) return ZODIAC_LIST[i].traits;
  }
  return '';
}

function getMbtiTraits(mbti) {
  return MBTI_TRAITS[mbti] || '';
}

function formatPersonalityForPrompt(p, tag) {
  if (!p || (!p.mbti && !p.zodiac && !p.element)) return '';
  tag = tag || '甲方';
  var parts = [];
  if (p.mbti) {
    var mbtiLabel = p.mbti;
    var mbtiDesc = getMbtiTraits(p.mbti);
    if (mbtiDesc) {
      mbtiLabel += '（' + mbtiDesc + '）';
    }
    parts.push('MBTI: ' + mbtiLabel);
  }
  if (p.zodiac) {
    var zLabel = getZodiacLabel(p.zodiac) || p.zodiac;
    var zTraits = getZodiacTraits(p.zodiac);
    var zDesc = zLabel;
    if (zTraits) {
      zDesc += ' - ' + zTraits;
    }
    parts.push('星座: ' + zDesc);
  }
  if (p.element && !p.zodiac) parts.push('属性: ' + p.element);
  return '  ' + tag + ': ' + parts.join('\n    ');
}

module.exports = {
  ZODIAC_LIST: ZODIAC_LIST,
  getElementByZodiac: getElementByZodiac,
  getZodiacLabel: getZodiacLabel,
  getZodiacTraits: getZodiacTraits,
  getMbtiTraits: getMbtiTraits,
  formatPersonalityForPrompt: formatPersonalityForPrompt,
};
