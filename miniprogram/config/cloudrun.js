// CloudRun 渐进迁移配置。
// v0.2.0 起关键写入统一通过小程序私有 CloudRun 服务。
module.exports = {
  enabled: true,
  env: 'cloudbase-d4g5p82875fe1a5ce',
  serviceName: 'ai-mediator-backend',
  progressPollIntervalMs: 1500,
};
