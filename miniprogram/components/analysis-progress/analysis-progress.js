// V3 服务端任务进度；不展示或暗示模型的内部思考过程。
Component({
  properties: {
    progress: { type: Object, value: {} },
  },
  data: {
    steps: [
      { key: 'queued', label: '进入队列' },
      { key: 'evidence', label: '整理证据' },
      { key: 'knowledge', label: '匹配指引' },
      { key: 'analyzing', label: '语义分析' },
      { key: 'validating', label: '核对报告' },
      { key: 'done', label: '报告完成' },
    ],
    currentStepIndex: 0,
  },
  observers: {
    'progress.step': function (step) {
      var indexes = {
        queued: 0,
        retrying: 0,
        formatting: 1,
        extracting: 1,
        quality_gate: 1,
        retrieving: 2,
        analyzing: 3,
        validating: 4,
        parsing: 4,
        finalizing: 4,
        done: 5,
      };
      if (indexes[step] != null) this.setData({ currentStepIndex: indexes[step] });
    },
  },
});
