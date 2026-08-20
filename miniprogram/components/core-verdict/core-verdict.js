// V3 核心报告：展示事实边界、争议与行动，不展示输赢评分。
Component({
  properties: {
    coreConclusion: { type: Object, value: null },
  },
  data: {
    summary: '',
    commonGround: [],
    disputedIssues: [],
    missingEvidence: [],
    nextActions: [],
    confidence: 0,
    confidenceLevel: '低',
    confidenceReasons: [],
    confidenceBreakdown: {},
    analysisBasis: {},
    riskNotice: '',
    isSinglePartyEvidence: false,
  },
  observers: {
    'coreConclusion': function (cc) {
      if (!cc) return;
      var confidence = Number(cc.confidence) || 0;
      var confidenceLevel = confidence >= 75 ? '较充分' : confidence >= 50 ? '有限' : '不足';
      var disputedIssues = Array.isArray(cc.disputedIssues) && cc.disputedIssues.length
        ? cc.disputedIssues
        : (cc.keyReasons || []).map(function (reason, index) { return { id: 'legacy_' + index, title: reason }; });
      var nextActions = Array.isArray(cc.nextActions) && cc.nextActions.length
        ? cc.nextActions
        : (cc.recommendedAction ? [cc.recommendedAction] : []);
      this.setData({
        summary: cc.oneLineVerdict || '',
        commonGround: cc.commonGround || [],
        disputedIssues: disputedIssues,
        missingEvidence: cc.missingEvidence || [],
        nextActions: nextActions,
        confidence: confidence,
        confidenceLevel: confidenceLevel,
        confidenceReasons: cc.confidenceReasons || [],
        confidenceBreakdown: cc.confidenceBreakdown || {},
        analysisBasis: cc.analysisBasis || {},
        riskNotice: cc.riskNotice || '',
        isSinglePartyEvidence: cc.isSinglePartyEvidence === true,
      });
    },
  },
});
