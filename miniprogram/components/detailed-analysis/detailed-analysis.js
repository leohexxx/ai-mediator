// ═══════════════════════════════════════════════
// detailed-analysis 组件 — 详细分析 Tab 区
// ═══════════════════════════════════════════════

Component({
  properties: {
    /** DetailedAnalysis */
    detailedAnalysis: {
      type: Object,
      value: null,
    },
    /** 当前 tab */
    activeTab: {
      type: String,
      value: 'characters',
    },
  },

  data: {
    /** Tab 列表 */
    tabs: [
      { key: 'characters', label: '人物画像' },
      { key: 'conflicts', label: '争议焦点' },
      { key: 'timeline', label: '时间线' },
    ],

    /** 案情摘要 */
    summary: '',
    /** 人物列表 */
    characters: [],
    /** 争议列表 */
    conflicts: [],
    /** 时间线 */
    timeline: [],
  },

  observers: {
    'detailedAnalysis': function (da) {
      if (!da) return;
      this.setData({
        summary: da.summary || '',
        characters: da.characters || [],
        conflicts: da.conflicts || [],
        timeline: da.timeline || [],
      });
    },
  },

  methods: {
    /**
     * 切换 Tab
     */
    onTabTap: function (e) {
      var tab = e.currentTarget.dataset.tab;
      this.setData({ activeTab: tab });
      this.triggerEvent('tabchange', { tab: tab });
    },
  },
});
