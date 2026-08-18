// ═══════════════════════════════════════════════
// evidence-section 组件 — 证据操作区
// ═══════════════════════════════════════════════

Component({
  properties: {
    /** 案例数据 */
    caseData: {
      type: Object,
      value: {},
    },
    /** 当前用户角色 */
    role: {
      type: String,
      value: 'party_a',
    },
    /** 己方证据 */
    myEvidence: {
      type: Object,
      value: null,
    },
  },

  data: {
    /** 是否已提交 */
    hasSubmitted: false,
    /** 消息数量 */
    messageCount: 0,
    /** 提交时间 */
    submittedTime: '',
    /** 是否可以修改 */
    canModify: true,
  },

  observers: {
    'myEvidence, caseData': function (myEvidence, caseData) {
      if (!caseData) return;
      var hasSubmitted = !!(myEvidence && myEvidence.parsedMessages && myEvidence.parsedMessages.length > 0);
      var messageCount = hasSubmitted ? myEvidence.parsedMessages.length : 0;
      var submittedTime = hasSubmitted ? this.formatTime(myEvidence.createdAt) : '';

      // 分析中和分析完成后不可修改
      var canModify = caseData.analysisLock !== true && caseData.status !== 'analyzing' && caseData.status !== 'cancel_requested';

      this.setData({
        hasSubmitted: hasSubmitted,
        messageCount: messageCount,
        submittedTime: submittedTime,
        canModify: canModify,
      });
    },
  },

  methods: {
    /**
     * 格式化时间
     */
    formatTime: function (isoString) {
      if (!isoString) return '';
      var date = new Date(isoString);
      var month = date.getMonth() + 1;
      var day = date.getDate();
      var hour = String(date.getHours()).padStart(2, '0');
      var minute = String(date.getMinutes()).padStart(2, '0');
      return (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day + ' ' + hour + ':' + minute;
    },

    /**
     * 点击上传
     */
    onUploadTap: function () {
      this.triggerEvent('upload');
    },

    /**
     * 点击查看报告
     */
    onViewReportTap: function () {
      this.triggerEvent('viewreport');
    },
  },
});
