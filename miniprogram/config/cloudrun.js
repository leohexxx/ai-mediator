// V3 生产配置：证据、分析、OCR 与追问必须通过原小程序的私有 CloudRun 服务。
// 不自动降级到旧云函数；需要回滚时发布旧代码版本并同步恢复数据库规则。
module.exports = {
  enabled: true,
  env: 'cloudbase-d4g5p82875fe1a5ce',
  serviceName: 'ai-mediator-backend',
  progressPollIntervalMs: 1500,
};
