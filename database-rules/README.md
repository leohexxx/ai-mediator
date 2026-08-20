# CloudBase 数据库安全规则

v0.2.0 起小程序不再直接读写业务集合；V3 的证据规则引擎、知识检索、分析、追问和 OCR 仍全部通过已鉴权的私有 CloudRun 服务访问。

在 CloudBase 控制台的集合权限管理中应用：

- `cases`、`analyses`、`analysis_rate_limits`、`evidence`、`evidence_batches`、`invitations`、`users`、`share_cards`：使用 `server-only.json`。
- `messages`（旧链路）、`conversation_messages`、`chat_jobs`、`ocr_jobs`：使用 `server-only.json`。`messages.json` 仅保留为紧急回滚旧云函数时的临时规则，正常发布不得应用。
- `ocr_jobs` 必须先在目标 CloudBase 环境创建，再应用规则；未创建集合时，异步 OCR 无法保存任务。

CloudRun 使用服务端 API Key 访问数据库，不受前端数据库规则限制，业务权限由后端参与方校验。规则部署后，用非案件参与者账号验证无法读取任何业务集合，并完整回归邀请、补证、分析、中断、追问和报告流程。

V3 首版知识库作为随服务发布、带版本号的只读代码资源，不新增客户端可访问的数据库集合。后续若迁移为数据库知识库，必须继续使用 `server-only.json`，并单独建立审核与发布流程。
