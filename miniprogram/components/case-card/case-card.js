// ═══════════════════════════════════════════════
// case-card 组件 — 案例列表卡片
// ═══════════════════════════════════════════════

var formatUtil = require('../../utils/format');

Component({
  properties: {
    /** 案例数据 */
    item: {
      type: Object,
      value: {},
    },
  },

  data: {
    /** 状态文案 */
    statusText: '',
    /** 状态图标 */
    statusIcon: '',
    /** 状态颜色类 */
    statusClass: '',
  },

  observers: {
    'item': function (item) {
      if (!item || !item.status) return;
      this.updateStatus(item);
    },
  },

  methods: {
    /**
     * 更新状态显示
     */
    updateStatus: function (item) {
      var that = this;
      var statusText = '';
      var statusIcon = '';
      var statusClass = '';

      if (item.role === 'party_a') {
        if (item.status === 'waiting_party_b') {
          statusText = '乙方 等待加入';
          statusIcon = '⏳';
          statusClass = 'status-waiting';
        } else if (item.status === 'waiting_submission' || item.status === 'dual_collecting' || item.status === 'canceled') {
          statusText = '乙方 ' + (item.party_b.submitted ? '✓已提交' : '⏳待提交');
          statusIcon = item.party_b.submitted ? '✅' : '⏳';
          statusClass = item.party_b.submitted ? 'status-done' : 'status-waiting';
        } else if (item.status === 'analyzing' || item.status === 'cancel_requested') {
          statusText = item.status === 'cancel_requested' ? '⏹ 正在打断' : '🔍 分析中';
          statusIcon = '🟢';
          statusClass = 'status-analyzing';
        } else if (item.status === 'completed') {
          statusText = '✅ 分析完成';
          statusIcon = '✅';
          statusClass = 'status-done';
        }
      } else {
        if (item.status === 'waiting_submission' || item.status === 'dual_collecting' || item.status === 'canceled') {
          statusText = '甲方 ' + (item.party_a.submitted ? '✓已提交' : '⏳待提交');
          statusIcon = item.party_a.submitted ? '✅' : '⏳';
          statusClass = item.party_a.submitted ? 'status-done' : 'status-waiting';
        } else if (item.status === 'analyzing' || item.status === 'cancel_requested') {
          statusText = item.status === 'cancel_requested' ? '⏹ 正在打断' : '🔍 分析中';
          statusIcon = '🟢';
          statusClass = 'status-analyzing';
        } else if (item.status === 'completed') {
          statusText = '✅ 分析完成';
          statusIcon = '✅';
          statusClass = 'status-done';
        }
      }

      that.setData({
        statusText: statusText,
        statusIcon: statusIcon,
        statusClass: statusClass,
      });
    },
  },
});
