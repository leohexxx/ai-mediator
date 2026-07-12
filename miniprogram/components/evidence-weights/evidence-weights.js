// ═══════════════════════════════════════════════
// evidence-weights 组件 — 关键证据权重列表（折叠展开）
// ═══════════════════════════════════════════════

Component({
  properties: {
    /** EvidenceWeight[] */
    items: {
      type: Array,
      value: [],
    },
  },

  data: {
    /** 是否展开全部 */
    expanded: false,
    /** 显示的项数 */
    displayCount: 3,
  },

  methods: {
    /**
     * 切换展开/折叠
     */
    onToggleExpand: function () {
      this.setData({ expanded: !this.data.expanded });
    },
  },
});
