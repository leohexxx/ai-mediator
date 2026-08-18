# 架构分析与修改方案 — 执行状态

> 根项目版本：`0.1.0`  
> CloudRun 版本：`1.0.0`  
> 分支：`agent/p0-cloudrun-security`  
> 状态日期：2026-08-18

本轮不修改既有对外版本号，通过独立提交保留每个整改阶段的可回滚版本。CloudRun 是目标分析执行链路；云函数链路作为小程序未启用 CloudRun 时的兼容回退。

---
## 问题1：公开仓库凭据与环境文件泄露风险（P0）
- **位置**：`.gitignore`、`.env.example`、GitHub `main` 初始化历史
- **问题描述**：环境文件或真实密钥进入公开历史后，删除工作区文件不能撤销泄露。
- **修改方案**：公开仓库从净化根提交初始化；忽略 `.env`、私有项目配置、运行时数据；示例配置只保留空值。提交：`92cc580`、`a237bf3`。
- **风险评估**：代码风险低；历史中曾出现过的凭据仍必须在供应商控制台轮换。

---
## 问题2：CloudRun 路由未形成统一鉴权边界（P0）
- **位置**：`ai-mediator-backend/cloudrun/server.js`、`middleware/auth.js`、`services/caseAccess.js`
- **问题描述**：路由挂载、调用方身份与案件参与者校验分散，可能产生未授权访问。
- **修改方案**：统一挂载鉴权中间件；生产只接受 CloudBase 网关注入身份头；分析、聊天、上传均校验案件参与者。提交：`a237bf3`。
- **风险评估**：中；错误的 CloudRun 访问类型配置会导致请求被拒绝，应使用小程序私有调用类型。

---
## 问题3：小程序直接读写敏感集合，绕过服务层（P0）
- **位置**：`miniprogram/services/analysis.js`、`pages/report/report.js`、`pages/case-detail/case-detail.js`、`components/chat-panel/chat-panel.js`、`cloudfunctions/getAnalysis/index.js`、`database-rules/`
- **问题描述**：页面直接访问 `cases/analyses/messages`，权限逻辑难以统一，客户端还能创建消息文档。
- **修改方案**：案件与分析读取改走鉴权云函数/CloudRun；消息文档只由云函数创建；客户端仅按 `_id + userId` 只读监听；提供前端拒写安全规则。提交：`0a6ac1f`。
- **风险评估**：中；上线代码后必须在 CloudBase 控制台应用 `database-rules`，否则规则文件本身不会自动生效。

---
## 问题4：伪异步与长任务生命周期不可靠（P0）
- **位置**：`cloudfunctions/analyzeCase/index.js`、`miniprogram/config/cloudrun.js`、`miniprogram/services/analysis.js`
- **问题描述**：响应后继续执行或云函数自调用可能在实例回收、超时后丢失任务。
- **修改方案**：兼容云函数链路完整 `await` 流水线；目标链路通过私有 `wx.cloud.callContainer` 调用 CloudRun，并返回 `202 queued`。提交：`b9a3e4f`、`886572f`。
- **风险评估**：中；启用 CloudRun 前需填写环境 ID 和服务名，未配置时保持云函数兼容路径。

---
## 问题5：进程内 WebSocket/后台任务无法横向扩展与恢复（P0）
- **位置**：`ai-mediator-backend/cloudrun/services/analysisWorker.js`、`analysisPipeline.js`、`routes/analyze.js`
- **问题描述**：内存连接和 `setImmediate` 作业在容器回收或多实例下会丢失，进度状态不可恢复。
- **修改方案**：进度持久化到数据库；分析使用数据库队列、事务入队、租约领取、最多 3 次重试、启动恢复扫描；完成/失败与案件状态事务提交。提交：`886572f`、`e128953`。
- **风险评估**：中；建议最小实例数为 1。缩容到 0 不丢任务，但要等下一次流量唤醒后恢复。

---
## 问题6：重复后端与失效适配器造成实现漂移（P1）
- **位置**：`ai-mediator-backend/client-adapter/`（已删除）、`miniprogram/services/analysis.js`
- **问题描述**：公共占位 URL、`wx.request` 适配器和云函数/CloudRun 多套实现并存，修复无法同步。
- **修改方案**：删除失效适配器；分析传输统一在小程序服务层选择“私有 CloudRun / 云函数回退”；共享进度协议使用数据库状态。提交：`b9a3e4f`。
- **风险评估**：低；迁移期仍保留云函数回退，完全下线需等 CloudRun 生产验证后另行执行。

---
## 问题7：流式消息重复拼接形成 O(n²) 开销（P1）
- **位置**：`cloudfunctions/chatWithAnalysis/index.js`、`miniprogram/services/chat.js`、`components/chat-panel/chat-panel.js`
- **问题描述**：每次流更新都重新拼接全部 chunk，回答越长，复制与渲染成本增长越快。
- **修改方案**：服务端使用 `db.command.push` 追加节流 chunk；客户端记录已消费下标，仅拼接新增 chunk，组件直接接收累计文本。提交：`0a6ac1f`。
- **风险评估**：低；若服务端回滚 chunk 数量，客户端会自动清空并重建一次全文。

---
## 问题8：案件状态枚举和迁移逻辑分散（P1）
- **位置**：`cloudfunctions/common/caseStatus.js`、`analyzeCase/index.js`、`uploadEvidence/index.js`、`miniprogram/utils/format.js`
- **问题描述**：`single_completed`、`dual_*` 等状态在类型、页面和云函数中不一致，并存在辩论自动分析条件永远无法命中的缺陷。
- **修改方案**：建立唯一服务端状态定义、迁移校验、最终状态推导和测试；前端复用统一文案/类型；修复辩论提交判断。提交：`c835870`。
- **风险评估**：中；非法历史状态会被拒绝，应先检查生产数据是否存在未定义值。

---
## 问题9：跨集合写入缺少一致性保护（P1）
- **位置**：`ai-mediator-backend/cloudrun/services/db.js`、`routes/analyze.js`、`cloudfunctions/createCase/index.js`、`joinCase/index.js`
- **问题描述**：案件/分析、案件/邀请分步写入，失败或并发加入会产生半成功与覆盖。
- **修改方案**：CloudRun 使用 `runTransaction`；修复 node-sdk `{data}` 适配错误；旧云函数用条件更新抢占邀请码并补偿释放，邀请创建失败删除孤立案件。提交：`1b27e54`、`e128953`、`1cb651b`。
- **风险评估**：中；云函数补偿不能覆盖进程被强杀的极端窗口，关键分析写入应优先走 CloudRun 事务链路。

---
## 问题10：OCR 串行或无界并发导致延迟和限流（P1）
- **位置**：`cloudfunctions/ocrBatch/index.js`、`ai-mediator-backend/cloudrun/services/ocr.js`
- **问题描述**：串行处理耗时过长，无界 `Promise.all` 又会放大内存和第三方 API 压力。
- **修改方案**：云函数与 CloudRun 均使用默认 4 路有界并发；CloudRun 支持 `OCR_MAX_CONCURRENT` 配置并验证顺序稳定。提交：`083f6f7`。
- **风险评估**：低；并发值过大仍可能触发供应商限流，生产建议从 4 开始压测。

---
## 问题11：云函数公共代码构建脚本重复且硬编码（P1）
- **位置**：`cloudfunctions/scripts/build-cf.cjs`、`cloudfunctions/scripts/__tests__/build-cf.test.cjs`
- **问题描述**：ESM/CJS 脚本并存且函数列表手工维护，新云函数容易漏同步公共代码。
- **修改方案**：保留单一 CommonJS 构建入口，按 `index.js` 自动发现全部函数，当前同步 16/16，并用测试校验。提交：`f25eafe`。
- **风险评估**：低；构建会重建各函数的 `common/`，公共修改应先落在 `cloudfunctions/common/`。

---
## 问题12：列表使用 skip/count，深页性能线性恶化（P2）
- **位置**：`cloudfunctions/getCaseList/index.js`、`miniprogram/services/case.js`、`pages/index/index.js`
- **问题描述**：每页执行总数统计并按页跳过记录，数据增长后数据库扫描成本持续上升。
- **修改方案**：按 `updatedAt` 游标查询并多取 1 条判断 `hasMore`；保留旧 `page/pageSize` 返回字段兼容调用方。提交：`6bbe8c8`。
- **风险评估**：低；极低概率的相同毫秒更新时间可能影响边界，后续数据模型可增加唯一复合排序键。

---
## 问题13：测试入口分散，PR 无持续验证（P2）
- **位置**：`package.json`、`.github/workflows/ci.yml`、`miniprogram/__tests__/`、`cloudfunctions/scripts/__tests__/`、`ai-mediator-backend/cloudrun/test/`
- **问题描述**：根测试只覆盖 React，无法阻止小程序、构建脚本和 CloudRun 回归。
- **修改方案**：新增 `test:mini`、`test:cloudfunctions`、`test:cloudrun`、`test:all`；GitHub Actions 在 Node 20 上执行全套测试。
- **风险评估**：低；CI 首次运行需要 GitHub Actions 可用，测试本身不依赖生产密钥。

## 发布与回滚

- PR：<https://github.com/leohexxx/ai-mediator/pull/1>
- 每个问题按独立提交保留，可按提交粒度回滚。
- 合并前执行 `npm run test:all`；部署前应用数据库规则并配置 CloudRun 私有访问、环境 ID、LLM 密钥和最小实例数。
