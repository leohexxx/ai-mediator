// CloudRun 渐进迁移配置。
// 默认关闭，确保未部署 CloudRun 时继续使用现有云函数流程。
module.exports = {
  enabled: false,
  env: '',
  serviceName: '',
  progressPollIntervalMs: 1500,
};
