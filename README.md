# 啷个对 V3

微信小程序中的聊天证据整理与沟通分析工具。V3 在原 AppID 和原 CloudBase 环境上升级，不创建新小程序。

产品不把 AI 包装成事实裁判。系统先整理可核对事实、证据质量和信息缺口，再使用大模型处理歧义、上下文和沟通建议。

## V3 核心能力

- 单人模式和双人协作模式，任意有自己证据的一方均可启动分析。
- 案件级分析锁、证据版本快照、任意参与方打断和幂等并发控制。
- 每次选择最多 9 张截图，可连续追加至每案 100 张。
- 腾讯高精度 OCR、长图切片、完全/近似重复过滤、低置信度人工校对。
- 后端规则引擎直接计算消息归属、数量、时间覆盖、金额、日期、承诺、证据质量和安全信号。
- 手机号、账号、邮箱及链接在进入模型前自动脱敏。
- 证据不足或紧急安全风险由规则引擎直接响应，可不调用 DeepSeek。
- 内置版本化调解知识库，以标签检索相关沟通和安全指引。
- 支持自愿填写 MBTI、星座和属性，作为沟通偏好参考；它们不参与事实、责任或置信度判断。
- DeepSeek 仅处理复杂语义；快速/深度模型分级、有限重试、深度模型降级、报告缓存和 JSON/证据引用校验。
- 报告展示共识、争议、缺失证据和下一步，不以前端输赢评分作为核心表达。

## 目录

```text
miniprogram/                    原微信小程序前端
ai-mediator-backend/cloudrun/   私有 CloudRun 后端
cloudfunctions/                 邀请、案例读取等兼容云函数
database-rules/                 客户端数据库安全规则
docs/v0.3.0-architecture.md     V3 架构与决策边界
docs/v0.3.0-release-runbook.md  V3 发布和回滚步骤
```

## 本地验证

```bash
npm install
npm install --prefix ai-mediator-backend/cloudrun
npm run test:all
npm run build
```

CloudRun 本地模式使用临时 JSON 数据库。生产环境必须通过环境变量注入：

- `CLOUDBASE_ENV_ID`
- `CLOUDBASE_APIKEY`
- `LLM_API_KEYS`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `DEEP_LLM_MODEL`
- 腾讯 OCR 凭据和通知内部令牌

不得把任何真实凭据提交到 Git。

## 发布边界

- 小程序继续使用 `project.config.json` 中的原 AppID。
- CloudRun 保持 `MINIAPP` 私有访问，不开启不必要的公网入口。
- 正式发布前应用 `database-rules/server-only.json`，并使用双账号回归邀请、补证、并发分析、打断、追问和报告。
- 隐私政策必须与真实供应商、保存期限和删除能力保持一致；当前版本不宣称已经具备一键删除全部云端数据的能力。
