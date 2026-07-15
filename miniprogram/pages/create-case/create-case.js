// ═══════════════════════════════════════════════
// 创建案例页
// ═══════════════════════════════════════════════

var caseService = require('../../services/case');
var authUtil = require('../../utils/auth');

Page({
  data: {
    /** 表单数据 */
    title: '',
    relationship: '',
    privacy: 'both',

    /** 关系类型列表 */
    relationshipOptions: [
      { value: 'couple', label: '情侣' },
      { value: 'friend', label: '朋友' },
      { value: 'colleague', label: '同事' },
      { value: 'family', label: '家人' },
      { value: 'other', label: '其他' },
    ],

    /** 隐私选项 */
    privacyOptions: [
      { value: 'both', label: '双方可见', desc: '分析完成后双方都能查看报告' },
      { value: 'initiator_only', label: '仅发起方可见', desc: '只有你能查看分析结果' },
    ],

    /** 提交状态 */
    submitting: false,
  },

  /**
   * 输入案例标题
   */
  onTitleInput: function (e) {
    this.setData({ title: e.detail.value });
  },

  /**
   * 选择关系类型
   */
  onRelationshipTap: function (e) {
    var value = e.currentTarget.dataset.value;
    this.setData({
      relationship: this.data.relationship === value ? '' : value,
    });
  },

  /**
   * 选择隐私设置
   */
  onPrivacyTap: function (e) {
    var value = e.currentTarget.dataset.value;
    this.setData({ privacy: value });
  },

  /**
   * 提交创建案例
   */
  onSubmit: function () {
    var that = this;

    if (this.data.submitting) return;

    this.setData({ submitting: true });

    // 获取用户信息
    authUtil.getUserProfile().then(function (userInfo) {
      return caseService.createCase({
        title: that.data.title || '评理',
        relationship: that.data.relationship,
        privacy: that.data.privacy,
        userInfo: userInfo,
      });
    }).then(function (res) {
      that.setData({ submitting: false });

      if (res.code === 0 && res.data) {
        wx.showToast({ title: '创建成功', icon: 'success' });
        // 跳转到详情页
        wx.redirectTo({
          url: '/pages/case-detail/case-detail?caseId=' + res.data.caseId + '&action=share',
        });
      } else {
        wx.showToast({ title: res.message || '创建失败', icon: 'none' });
      }
    }).catch(function (err) {
      console.error('创建案例失败:', err);
      that.setData({ submitting: false });
      wx.showToast({ title: '创建失败，请重试', icon: 'none' });
    });
  },
});
