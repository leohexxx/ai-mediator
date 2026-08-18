# Changelog

## Unreleased — Architecture remediation

版本号保持：根项目 `0.1.0`，CloudRun `1.0.0`。

- 加固 CloudRun 身份与案件授权边界。
- 增加私有 CloudRun 分析传输、持久化进度和可恢复数据库作业。
- 统一案件状态机与云函数公共构建流程。
- 改为游标分页、有界 OCR 并发和增量流式文本拼接。
- 将敏感数据访问收口到服务端并提供数据库安全规则。
- 增加跨模块全量测试入口与 GitHub Actions CI。

完整提交映射见 `docs/architecture-remediation-status.md`。
