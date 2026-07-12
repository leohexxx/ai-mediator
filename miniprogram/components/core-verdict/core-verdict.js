// ═══════════════════════════════════════════════
// core-verdict 组件 — 核心结论卡片
// ═══════════════════════════════════════════════

Component({
  properties: {
    /** CoreConclusion 数据 */
    coreConclusion: {
      type: Object,
      value: null,
    },
  },

  data: {
    /** 胜方 */
    winner: '',
    /** 甲方分数 */
    scoreA: 50,
    /** 乙方分数 */
    scoreB: 50,
    /** 一句话结论 */
    oneLineVerdict: '',
    /** 核心原因 */
    keyReasons: [],
    /** 建议行动 */
    recommendedAction: '',
    /** 置信度 */
    confidence: 0,
    /** 置信度原因 */
    confidenceReasons: [],
    /** 置信度等级 */
    confidenceLevel: '中',
  },

  observers: {
    'coreConclusion': function (cc) {
      if (!cc) return;

      var winner = '';
      if (cc.overallWinner === 'a') winner = '🏆 甲方更有理';
      else if (cc.overallWinner === 'b') winner = '🏆 乙方更有理';
      else winner = '🤝 双方各有道理';

      var confidenceLevel = '低';
      if (cc.confidence >= 75) confidenceLevel = '高';
      else if (cc.confidence >= 50) confidenceLevel = '中';

      this.setData({
        winner: winner,
        scoreA: cc.scoreA || 50,
        scoreB: cc.scoreB || 50,
        oneLineVerdict: cc.oneLineVerdict || '',
        keyReasons: cc.keyReasons || [],
        recommendedAction: cc.recommendedAction || '',
        confidence: cc.confidence || 50,
        confidenceReasons: cc.confidenceReasons || [],
        confidenceLevel: confidenceLevel,
      });
    },
  },
});
