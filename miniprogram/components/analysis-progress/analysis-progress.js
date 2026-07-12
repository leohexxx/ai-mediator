// ═══════════════════════════════════════════════
// analysis-progress 组件 — CoT 7 步进度条
// ═══════════════════════════════════════════════

Component({
  properties: {
    /** 进度对象 {step, message, progress} */
    progress: {
      type: Object,
      value: {},
    },
  },

  data: {
    /** 步骤列表 */
    steps: [
      { key: 'parsing', label: '准备分析', icon: '📋' },
      { key: 'understanding', label: '理解对话', icon: '🧠' },
      { key: 'evidence', label: '提取证据', icon: '🔍' },
      { key: 'emotion', label: '分析情绪', icon: '💭' },
      { key: 'judging', label: '综合判断', icon: '⚖️' },
      { key: 'strategy', label: '制定策略', icon: '🎯' },
      { key: 'done', label: '分析完成', icon: '✅' },
    ],

    /** 当前步骤索引 */
    currentStepIndex: -1,
  },

  observers: {
    'progress.step': function (step) {
      if (!step) return;
      var steps = this.data.steps;
      for (var i = 0; i < steps.length; i++) {
        if (steps[i].key === step) {
          this.setData({ currentStepIndex: i });
          break;
        }
      }
    },
  },
});
