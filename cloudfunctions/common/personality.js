// ═══════════════════════════════════════════════
// 星座属性映射 (云函数 CommonJS 版)
// ═══════════════════════════════════════════════

var ZODIAC_LIST = [
  { label: '白羊座', value: 'aries', element: '火象', date: '3.21-4.19' },
  { label: '金牛座', value: 'taurus', element: '土象', date: '4.20-5.20' },
  { label: '双子座', value: 'gemini', element: '风象', date: '5.21-6.21' },
  { label: '巨蟹座', value: 'cancer', element: '水象', date: '6.22-7.22' },
  { label: '狮子座', value: 'leo', element: '火象', date: '7.23-8.22' },
  { label: '处女座', value: 'virgo', element: '土象', date: '8.23-9.22' },
  { label: '天秤座', value: 'libra', element: '风象', date: '9.23-10.23' },
  { label: '天蝎座', value: 'scorpio', element: '水象', date: '10.24-11.22' },
  { label: '射手座', value: 'sagittarius', element: '火象', date: '11.23-12.21' },
  { label: '摩羯座', value: 'capricorn', element: '土象', date: '12.22-1.19' },
  { label: '水瓶座', value: 'aquarius', element: '风象', date: '1.20-2.18' },
  { label: '双鱼座', value: 'pisces', element: '水象', date: '2.19-3.20' },
];

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

function formatPersonalityForPrompt(p, tag) {
  if (!p || (!p.mbti && !p.zodiac && !p.element)) return '';
  tag = tag || '甲方';
  var parts = [];
  if (p.mbti) parts.push('MBTI: ' + p.mbti);
  if (p.zodiac) {
    var label = getZodiacLabel(p.zodiac) || p.zodiac;
    parts.push('星座: ' + label);
  }
  if (p.element) parts.push('属性: ' + p.element);
  return '  ' + tag + ': ' + parts.join(' / ');
}

module.exports = {
  ZODIAC_LIST: ZODIAC_LIST,
  getElementByZodiac: getElementByZodiac,
  getZodiacLabel: getZodiacLabel,
  formatPersonalityForPrompt: formatPersonalityForPrompt,
};
