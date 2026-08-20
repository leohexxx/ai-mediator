// ═══════════════════════════════════════════════
// personality-picker — 性格信息选择器组件
// MBTI (16型) + 星座 (12宫) + 属性 (土风火水，选星座自动关联)
// ═══════════════════════════════════════════════

var personalityUtil = require('../../utils/personality');

Component({
  properties: {
    // 已有数据（编辑模式回填）
    personalityA: {
      type: Object,
      value: null,
      observer: function (val) { this._syncFromData('A', val); },
    },
    personalityB: {
      type: Object,
      value: null,
      observer: function (val) { this._syncFromData('B', val); },
    },
    showHint: { type: Boolean, value: true },
    hintText: { type: String, value: '补充性格信息，让分析更懂你们' },
    partyALabel: { type: String, value: '关于你' },
    partyBLabel: { type: String, value: '关于对方' },
    // 双人案件中，参与者只能编辑自己的资料；单人案件可补充双方资料。
    editableA: { type: Boolean, value: true },
    editableB: { type: Boolean, value: true },
    compact: { type: Boolean, value: false },
  },

  data: {
    mbtiOptions: personalityUtil.MBTI_LIST,
    zodiacLabels: [],
    zodiacValues: [],
    elementOptions: personalityUtil.ELEMENT_LIST,

    // A 方
    mbtiA: '', mbtiIndexA: -1,
    zodiacA: '', zodiacLabelA: '', zodiacIndexA: -1,
    elementA: '', elementIndexA: -1,
    autoElementA: '',

    // B 方
    mbtiB: '', mbtiIndexB: -1,
    zodiacB: '', zodiacLabelB: '', zodiacIndexB: -1,
    elementB: '', elementIndexB: -1,
    autoElementB: '',
  },

  lifetimes: {
    attached: function () {
      var list = personalityUtil.ZODIAC_LIST;
      var labels = [];
      var values = [];
      for (var i = 0; i < list.length; i++) {
        labels.push(list[i].label);
        values.push(list[i].value);
      }
      this.setData({ zodiacLabels: labels, zodiacValues: values });
    },
  },

  methods: {
    // ---- A 方 ----
    onMbtiChangeA: function (e) {
      var idx = parseInt(e.detail.value);
      var val = personalityUtil.MBTI_LIST[idx] || '';
      this.setData({ mbtiA: val, mbtiIndexA: idx });
      this._emitChange();
    },

    onZodiacChangeA: function (e) {
      var idx = parseInt(e.detail.value);
      var val = this.data.zodiacValues[idx] || '';
      var label = this.data.zodiacLabels[idx] || '';
      var autoEl = personalityUtil.getElementByZodiac(val);
      var elIdx = personalityUtil.ELEMENT_LIST.indexOf(autoEl);
      this.setData({
        zodiacA: val, zodiacLabelA: label, zodiacIndexA: idx,
        autoElementA: autoEl,
        elementA: autoEl, elementIndexA: elIdx >= 0 ? elIdx : -1,
      });
      this._emitChange();
    },

    onElementChangeA: function (e) {
      var idx = parseInt(e.detail.value);
      var val = personalityUtil.ELEMENT_LIST[idx] || '';
      this.setData({ elementA: val, elementIndexA: idx });
      this._emitChange();
    },

    // ---- B 方 ----
    onMbtiChangeB: function (e) {
      var idx = parseInt(e.detail.value);
      var val = personalityUtil.MBTI_LIST[idx] || '';
      this.setData({ mbtiB: val, mbtiIndexB: idx });
      this._emitChange();
    },

    onZodiacChangeB: function (e) {
      var idx = parseInt(e.detail.value);
      var val = this.data.zodiacValues[idx] || '';
      var label = this.data.zodiacLabels[idx] || '';
      var autoEl = personalityUtil.getElementByZodiac(val);
      var elIdx = personalityUtil.ELEMENT_LIST.indexOf(autoEl);
      this.setData({
        zodiacB: val, zodiacLabelB: label, zodiacIndexB: idx,
        autoElementB: autoEl,
        elementB: autoEl, elementIndexB: elIdx >= 0 ? elIdx : -1,
      });
      this._emitChange();
    },

    onElementChangeB: function (e) {
      var idx = parseInt(e.detail.value);
      var val = personalityUtil.ELEMENT_LIST[idx] || '';
      this.setData({ elementB: val, elementIndexB: idx });
      this._emitChange();
    },

    // ---- 同步数据 ----
    _syncFromData: function (party, data) {
      if (!data) return;
      var prefix = party === 'A' ? '' : 'B';
      var updates = {};

      if (data.mbti) {
        var mbtiIdx = personalityUtil.MBTI_LIST.indexOf(data.mbti);
        updates['mbti' + party] = data.mbti;
        updates['mbtiIndex' + party] = mbtiIdx;
      }
      if (data.zodiac) {
        var zIdx = personalityUtil.ZODIAC_LIST.findIndex(function (z) { return z.value === data.zodiac; });
        if (zIdx >= 0) {
          updates['zodiac' + party] = data.zodiac;
          updates['zodiacLabel' + party] = personalityUtil.ZODIAC_LIST[zIdx].label;
          updates['zodiacIndex' + party] = zIdx;
          updates['autoElement' + party] = personalityUtil.ZODIAC_LIST[zIdx].element;
        }
      }
      if (data.element) {
        var eIdx = personalityUtil.ELEMENT_LIST.indexOf(data.element);
        updates['element' + party] = data.element;
        updates['elementIndex' + party] = eIdx >= 0 ? eIdx : -1;
      }
      if (Object.keys(updates).length > 0) this.setData(updates);
    },

    _emitChange: function () {
      this.triggerEvent('change', {
        personalityA: this.getPersonalityA(),
        personalityB: this.getPersonalityB(),
      });
    },

    getPersonalityA: function () {
      return this._buildPersonality(
        this.data.mbtiA, this.data.zodiacA, this.data.elementA
      );
    },

    getPersonalityB: function () {
      return this._buildPersonality(
        this.data.mbtiB, this.data.zodiacB, this.data.elementB
      );
    },

    _buildPersonality: function (mbti, zodiac, element) {
      var p = {};
      if (mbti) p.mbti = mbti;
      if (zodiac) p.zodiac = zodiac;
      if (element) p.element = element;
      return Object.keys(p).length > 0 ? p : null;
    },

    /**
     * 外部调用：获取完整数据
     */
    getData: function () {
      return {
        personalityA: this.getPersonalityA(),
        personalityB: this.getPersonalityB(),
      };
    },

    /**
     * 检查是否有任何数据被填写
     */
    hasAnyData: function () {
      var a = this.getPersonalityA();
      var b = this.getPersonalityB();
      return (a !== null) || (b !== null);
    },
  },
});
