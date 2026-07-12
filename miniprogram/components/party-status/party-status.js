// ═══════════════════════════════════════════════
// party-status 组件 — 双人状态面板
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
    /** 状态文案 */
    statusLabel: {
      type: String,
      value: '',
    },
    /** 对方状态文案 */
    otherPartyLabel: {
      type: String,
      value: '',
    },
  },

  data: {
    /** 甲方状态 */
    partyAStatus: '',
    partyAClass: '',
    partyATime: '',
    /** 乙方状态 */
    partyBStatus: '',
    partyBClass: '',
    partyBTime: '',
  },

  observers: {
    'caseData, role': function (caseData, role) {
      if (!caseData) return;
      this.updateStatuses(caseData, role);
    },
  },

  methods: {
    /**
     * 更新双方状态
     */
    updateStatuses: function (caseData, role) {
      var partyAStatus = '';
      var partyAClass = '';
      var partyATime = '';
      var partyBStatus = '';
      var partyBClass = '';
      var partyBTime = '';

      // 甲方状态
      if (caseData.party_a.submitted) {
        partyAStatus = '✓ 已提交';
        partyAClass = 'status-done';
        partyATime = caseData.party_a.submittedAt
          ? this.formatTimeShort(caseData.party_a.submittedAt)
          : '';
      } else {
        partyAStatus = '⏳ 待提交';
        partyAClass = 'status-pending';
      }

      // 乙方状态
      if (!caseData.party_b.openid) {
        partyBStatus = '等待加入...';
        partyBClass = 'status-empty';
      } else if (caseData.party_b.submitted) {
        partyBStatus = '✓ 已提交';
        partyBClass = 'status-done';
        partyBTime = caseData.party_b.submittedAt
          ? this.formatTimeShort(caseData.party_b.submittedAt)
          : '';
      } else {
        partyBStatus = '⏳ 待提交';
        partyBClass = 'status-pending';
      }

      this.setData({
        partyAStatus: partyAStatus,
        partyAClass: partyAClass,
        partyATime: partyATime,
        partyBStatus: partyBStatus,
        partyBClass: partyBClass,
        partyBTime: partyBTime,
      });
    },

    /**
     * 简短时间格式
     */
    formatTimeShort: function (isoString) {
      if (!isoString) return '';
      var date = new Date(isoString);
      var month = date.getMonth() + 1;
      var day = date.getDate();
      return (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
    },
  },
});
