# 啷个对 / AI Mediator：下一位 AI 交接说明

最后整理：2026-08-20  
当前应用版本：`0.3.9`（代码）/ 待发布 `0.3.10`（小程序包）  
小程序 AppID：`wxf82c52d4800346a6`（必须在这个既有小程序上更新，禁止新建小程序）

这份文档记录已完成的改造、产品约束、当前部署状态、未解决问题和继续修改时必须遵守的边界。它不包含任何真实密钥、Token、SecretId 或 SecretKey；凭据只应存在于 CloudRun 环境变量或用户本地未纳入 Git 的环境文件中。

## 0. 本次交接新增（2026-08-20）

### 0.1 本机环境文件位置（供继续操作使用）

- 项目内已存在本机环境文件：
  ```text
  D:\4.开发工具\code\ai-mediator\ai-mediator-backend\cloudrun\env.txt
  ```
- 该文件内容包含（键名，不要泄露值）：
  ```text
  CLOUDBASE_ENV_ID=cloudbase-d4g5p82875fe1a5ce
  CLOUDBASE_APIKEY=<CloudBase 服务端 API Key，JWT 形式，client_type=client_server>
  LOCAL_MODE=false
  ```
- 该文件已被 `.gitignore` 规则 `ai-mediator-backend/cloudrun/env.txt` 忽略，验证结果：`git check-ignore` 返回 `IGNORED`。
- 继续执行 CloudBase 管理命令前，先在本机加载它：
  ```bash
  cd "D:/4.开发工具/code/ai-mediator/ai-mediator-backend/cloudrun"
  set -a && . ./env.txt && set +a
  ```
- 不要把它提交到 Git，不要把它复制到其它目录，不要在聊天里粘贴真实值。

### 0.2 本轮实际完成的事情

- 使用 `env.txt` 中的 CloudBase 服务端 API Key 连接目标环境 `cloudbase-d4g5p82875fe1a5ce` 成功。
- 执行集合初始化，生产集合 `ocr_jobs` 已创建（`created:true`、`exists:true`）。
- 验证 `ocr_jobs` 可读、可写、可删（已清理探测数据）；验证 `cases` 集合可读（count=1）。
- 将 `ocr_jobs` 权限在控制台手动配置为「仅管理端可读写」，等价于 `database-rules/server-only.json` 的四项 `false`。
- 重新跑定向回归：CloudRun OCR 4/4、小程序 CloudRun 链路 1/1，均通过。
- 定位「上传图片识别半天后报没网络」的根因：生产 CloudRun 仍是旧版本 `006`，没有本轮 `ocr_jobs`、`OCR_COLLECTION_NOT_READY` 和结构化日志修复；不是 CloudBase 集合/权限问题，也不是本机代码问题。

### 0.3 交接给下一位 AI 必须完成的动作

1. 让用户把 CloudRun 服务 `ai-mediator-backend` 从 `006` 重启 / 发布新版本（或重新部署镜像），并保持访问类型 `MINIAPP`。
2. 让用户在微信开发者工具上传小程序为 `0.3.10`，并在公众平台设为体验版、清除旧缓存后重扫。
3. 上传图片做端到端回归：`POST /api/upload/ocr-jobs` 返回 `202 + jobId` → Worker → 千问视觉 → 轮询完成 → 页面显示「继续识别这批截图」可恢复。
4. 若仍失败，收集小程序 vConsole 的 `errMsg`、`statusCode`、`response.data.message`，以及 CloudRun 结构化日志的 `ocr_job_queued/started/completed/failed` 事件，再定位。

## 1. 先读这一节：当前工作目录的状态

- 当前目录 `D:\4.开发工具\code\ai-mediator` 已同步 V3.9 运行代码，可用于微信开发者工具上传和本地测试。
- 此目录的 Git 工作树有大量用户原有的未提交修改和未跟踪文件，**不是干净的发布基线**。禁止执行 `git reset --hard`、`git clean`、全量覆盖或 `git add .`。
- V3.9 的干净发布工作树在 `D:\4.开发工具\code\ai-mediator-v0.2.0`，分支为 `codex/v0.3.0-product-backend-optimization`，已推送到 GitHub。已知提交为 `45fef47 feat(ocr): run Qwen vision through durable async jobs`，标签为 `v0.3.9`。
- 同步当前目录前已做备份：`D:\4.开发工具\code\ai-mediator-backups\project-before-v3.9-async-qwen-ocr-20260819-105400`。只有需要人工比对或回退已同步的 V3.9 文件时才使用，不能整体覆盖当前目录。

## 2. 产品目标与不可改变的规则

产品是聊天证据整理和沟通分析工具，不是法律裁判或“绝对判输赢”的工具。

### 2.1 单人和双人流程

- 单人：一个用户可持续补充文字、截图、备注，随后分析和追问。
- 双人：双方分别补充自己的材料；任意一方只要已有有效证据即可开始分析，不要求对方先提交。
- 两人同时点击开始分析时，服务端事务只允许一个任务成功；另一方得到“对方已启动分析”的冲突提示。
- 第一个成功任务取得案件级分析锁，并固化本轮证据版本快照。
- `analyzing` / `cancel_requested` 期间，双方均不能新增、改动或删除证据，也不能新开分析。
- 双方都可以取消（“打断分析并补充证据”）；取消被服务端确认且任务进入 `canceled` 后，才允许继续补证。
- 分析已经完成后可直接补证并开始新一轮，不需要先取消旧结果。
- 只有一方提供材料时，报告必须标出“单方证据”，并降低置信度上限。

### 2.2 证据、OCR 与隐私

- 微信每次只能选择最多 9 张图片，但用户可持续追加批次；默认每案最多 100 张。
- 证据采用 `evidence_batches` 追加与版本号，而不是覆盖同一方的旧证据。
- 每一轮分析只能读取 `lockedEvidenceRevision` 及之前有效证据；历史证据和历史报告都必须保留。
- OCR 结果需支持人工校对；低置信度、说话人不明、重复截图都应在进入正式证据前可见。
- 手机号、账号、邮箱和 URL 在进入大模型前脱敏。
- 聊天证据不得加入跨案件共享知识库。知识库只允许存放人工审核、版本化的通用沟通与安全指引。

### 2.3 MBTI / 星座

- 必须保留 MBTI、星座与属性填写能力。
- 默认视角为“只按证据分析”，不会把画像资料送给模型。
- 用户主动选择“证据 + 沟通画像”时，才将这些资料作为自愿的沟通偏好参考；它们只能影响建议的措辞、节奏和沟通渠道。
- 它们绝不能改变事实归属、责任、证据充分度、胜负表达或置信度。

## 3. 版本演进摘要

| 版本 | 已完成的关键改动 |
| --- | --- |
| `0.1.0` | CloudRun 身份/案件授权加固、任务进度、数据库规则和 CI。 |
| `0.2.0` | 双人分析锁、取消状态机、证据版本化、腾讯 OCR、重复过滤、可恢复任务、私有 CloudRun。 |
| `0.3.0` | 规则优先：身份/数量/日期/金额/承诺/质量/安全信号由后端直接计算；大模型只处理歧义与沟通建议；增加脱敏、轻量知识库、缓存和模型降级。 |
| `0.3.1` | 恢复可选 MBTI/星座；单人可补全双方画像，双人各自只编辑自己的画像。 |
| `0.3.2` | 分离“分析视角”和“分析深度”，画像仅在用户主动选择时进入模型与缓存键。 |
| `0.3.3` - `0.3.6` | 恢复并优化原“啷个对”俏皮、丰富的视觉，不移除单人/双人、截图、匿名参与、追问、证据版本和中断能力；移除无法保证的绝对承诺。 |
| `0.3.7` | 相册图先传 Cloud Storage，客户端只把文件 ID 给 CloudRun，解决批量 Base64 请求体过大。 |
| `0.3.8` | 逐张同步 OCR 尝试缓解超时，但长截图的模型耗时仍可能超过小程序私有 `callContainer` 等待窗口。 |
| `0.3.9` | OCR 改为持久化异步作业：两秒内创建任务、后台识别、客户端轮询并可恢复；主通道为千问视觉，失败回退腾讯 OCR。 |

完整历史可参阅 [CHANGELOG.md](CHANGELOG.md)。

## 4. 当前架构与关键代码入口

```text
微信小程序
  └─ miniprogram/
       ├─ 页面、组件、草稿恢复、轮询
       └─ services/* -> utils/cloudrun.js
                         └─ 私有 CloudRun（MINIAPP）
                              └─ ai-mediator-backend/cloudrun/
                                   ├─ 鉴权与案件参与方校验
                                   ├─ evidence_batches / analyses / ocr_jobs
                                   ├─ 分析 Worker
                                   └─ OCR Worker -> 千问视觉 -> 腾讯 OCR 回退

CloudBase 数据库 / 云存储
  └─ 前端业务集合不可直接读写；CloudRun 用服务端 API Key 访问
```

| 目标 | 主要位置 | 说明 |
| --- | --- | --- |
| CloudRun 入口 | `ai-mediator-backend/cloudrun/server.js` | 启动 Express、分析 Worker 和 OCR Worker。 |
| 配置 | `ai-mediator-backend/cloudrun/config.js`、`.env.example` | 只能放变量名和示例，绝不提交真实值。 |
| OCR 作业 API | `ai-mediator-backend/cloudrun/routes/upload.js` | `POST /api/upload/ocr-jobs` 创建，`GET /api/upload/ocr-jobs/:id` 查询。 |
| OCR Worker | `ai-mediator-backend/cloudrun/services/ocrWorker.js` | 事务领取、租约、重试、多实例抢占保护。 |
| OCR Pipeline | `ai-mediator-backend/cloudrun/services/ocrJobPipeline.js` | 读云存储、哈希去重、千问主通道、腾讯回退、写入结果。 |
| 千问适配 | `ai-mediator-backend/cloudrun/services/qwenVision.js` | 严格 JSON 输出、图片中左右气泡对应 `self/other/system`。 |
| 上传页 | `miniprogram/pages/upload/upload.js` | 保存草稿、待处理任务 ID、离开页面后恢复。 |
| 小程序证据服务 | `miniprogram/services/evidence.js` | 上传到云存储、创建/轮询 OCR 作业、将 OCR 结果送入校对。 |
| 分析状态机 | `ai-mediator-backend/cloudrun/routes/analyze.js`、`services/analysisWorker.js` | 分析锁、版本快照、取消、幂等和任务恢复。 |
| 规则引擎/知识库 | `ai-mediator-backend/cloudrun/services/` | 事实提取、质量/安全分流、脱敏与标签知识库。 |
| 数据库规则 | `database-rules/` | 所有业务集合，包括 `ocr_jobs`，正常情况下均为 server-only。 |

## 5. OCR 超时问题：根因、已修复方案与验证方式

### 已知根因

小程序私有 CloudRun 的同步 `cloud.callContainer` 调用在约 15 秒后可能超时。长截图视觉识别实测可超过这个窗口。此前两类补丁都不足以从根上解决：

1. 直接上传 Base64：会先触发请求体过大。
2. 先上传云存储、再同步逐张 OCR：请求体问题解决，但单张长截图的模型调用仍可能超时。

### V3.9 的正确链路

1. 小程序上传图片到 `evidence/<caseId>/` 云存储。
2. 小程序调用 `POST /api/upload/ocr-jobs`，服务端仅创建 `ocr_jobs` 记录并应快速返回 `202`。
3. CloudRun OCR Worker 领取任务，在后台逐张识别。
4. 小程序每 2 秒查询一次作业状态；页面退出后草稿保存 `pendingOcrJobId`，重新进入可恢复。
5. 每张图片先做精确哈希和感知哈希去重；再用千问视觉识别。千问失败才使用腾讯高精度 OCR。
6. Worker 写入 `completed` / `failed`，只有持有当前租约的 Worker 可写最终结果，避免旧实例覆盖新结果。

### 用户验证步骤

1. 微信公众平台的体验版必须确认选择的是 `0.3.9` 上传版本，而不是旧 `0.3.8` 包。
2. 清除小程序缓存或重新扫码进入体验版。
3. 在同一案件先选 9 张图并上传，等待任务进度；随后再补 2 张，确认可连续追加。
4. 中途退出上传页再进入，确认“正在处理”的任务能恢复，而不是要求重新选图。
5. 若仍出现 `cloud.callContainer ... 102002 请求超时`，优先确认客户端版本和请求路径：V3.9 的相册图片不应同步请求旧 `/api/upload/ocr-batch`，而应先看到 `/api/upload/ocr-jobs` 的快速响应。

## 6. 已部署的云端状态（仅作交接，不要在文档中补写凭据）

- CloudBase 环境：既有环境 `cloudbase-d4g5p82875fe1a5ce`。
- CloudRun 服务：`ai-mediator-backend`，交接时已确认线上仍是旧版本 `006`（流量 100%）。`006` 不包含本轮 OCR 异步任务、`ocr_jobs` 初始化与结构化日志修复，必须重启或重新部署到新版本后才能验证截图 OCR。
- 本机已存在服务端凭据文件 `ai-mediator-backend/cloudrun/env.txt`（已 gitignore），其中 `CLOUDBASE_ENV_ID=cloudbase-d4g5p82875fe1a5ce`、`CLOUDBASE_APIKEY=<服务端 API Key>`、`LOCAL_MODE=false`。继续操作前用 `set -a && . ./env.txt && set +a` 加载，不要提交或打印值。
- CloudRun 必须保持私有访问类型 `MINIAPP`，不得改为 `PUBLIC` 或 `OA`。
- 建议并已配置的容量基线：最小实例 `2`、最大实例 `10`、每实例分析并发 `2`、每实例 OCR 并发 `1`（OCR 由两个最小实例横向处理）。
- 已配置但绝不记录值的环境变量类别：CloudBase 服务端 API Key、DeepSeek Key、腾讯 OCR 凭据、千问视觉 Key、通知内部令牌。
- 千问视觉相关变量名：`QWEN_VISION_API_KEY`、`QWEN_VISION_MODEL=qwen3.8-max`、`QWEN_VISION_BASE_URL`、`QWEN_VISION_TIMEOUT_MS=120000`、`OCR_JOB_POLL_MS=2000`、`OCR_JOB_LEASE_MS=600000`、`OCR_JOB_MAX_ATTEMPTS=2`、`OCR_JOB_MAX_CONCURRENT=1`。
- `ocr_jobs` 已设置为数据库 server-only：客户端 `read/create/update/delete` 都禁止，CloudRun 通过服务端 API Key 访问并在代码里校验参与方。集合已在生产环境创建并验证可读写；初始化脚本为 `npm run db:ensure-collections --prefix ai-mediator-backend/cloudrun`；集合缺失时会转换为 `OCR_COLLECTION_NOT_READY`。
- 小程序包 `0.3.9` 已上传到原 AppID；交接时需上传 `0.3.10` 并设为体验版完成回归，再提交审核。

## 7. 测试基线与已验证项

在干净 V3.9 工作树已通过：

```powershell
npm run test:all
npm run build
```

测试汇总：Vitest 67 个、小程序测试 19 个、云函数测试 5 个、CloudRun 测试 35 个均通过。构建存在既有的 Vite chunk 大小警告，但不阻断构建。

已做的额外检查：

- 小程序 JS 没有旧微信编译器不支持的可选链 `?.` 与空值合并 `??`。
- 千问视觉服务的契约测试通过，能够输出文字、blocks 和说话人标识。
- OCR Worker 的租约领取测试通过。
- 代码与提交文档做过真实密钥扫描，未把已配置凭据写入 Git。

## 8. 当前仍存在的问题和下一步优先级

### P0：先完成体验版真机回归

- 异步 OCR 已部署，但需要在 **0.3.10 体验版**用真实手机截图走完链路。重点确认创建作业在同步等待窗口内返回、后台最终完成、重进页面恢复、失败信息可理解。
- 交接时线上 CloudRun 仍是旧版本 `006`，未包含本轮 `ocr_jobs` 初始化、`OCR_COLLECTION_NOT_READY` 和结构化日志；必须先重启 / 重新部署，再测 OCR。
- 当前 CloudRun 的应用请求日志可见性有限。已补充不含聊天文本和图片内容的结构化 OCR 事件：`ocr_job_queued`、`ocr_job_started`、`ocr_job_completed`、`ocr_job_failed`，并记录 `jobId`、案件 ID、图片数量、尝试次数、错误码和耗时；若真机失败，应按这些字段定位。
- 不要为 `102002` 再把 OCR 改回同步调用；这是已连续出现的同一个根因，应该诊断是否仍使用旧包或异步任务本身失败。

### P0：凭据安全

- 用户曾在聊天中发送过多种真实凭据。所有这类凭据应立即轮换，包括云账户、CloudBase API Key、DeepSeek 与千问视觉 Key。
- 本机 `ai-mediator-backend/cloudrun/env.txt` 已 gitignore，但 `ai-mediator-backend/` 目录整体仍为未跟踪目录，确认不要把它整体提交；只提交明确列出的源码文件。
- 检查本机全局视觉脚本是否硬编码千问 Key；应改为从本机环境变量读取，且该脚本不应进入项目 Git。
- 每次提交前运行凭据扫描；禁止把 `.env.local`、`.env.Local`、私钥、上传日志中可能出现的 Token 提交。

### P1：部署与可观测性

- 正式发布前应补齐按 `jobId` 的 OCR 阶段指标：排队、下载、千问耗时、腾讯回退、写库耗时、总耗时、失败码。
- 建议增加队列积压、失败率、OCR 回退率、LLM 延迟、成本告警；是否开启日志服务会带来额外成本，需要由项目所有者确认。
- 部署工具曾出现把 CloudRun 访问类型临时改成 `PUBLIC/OA/MINIAPP` 的平台异常。每次部署后必须复查并纠正为仅 `MINIAPP`。

### P1：数据模型与兼容链路

- 旧云函数和旧 `/ocr-batch` 路径仍为兼容已发布旧包而保留。确认 0.3.9 稳定后，先统计旧包占比、再制定移除计划，不能贸然删除。
- 旧文档 `docs/v0.3.0-architecture.md` 与 `docs/v0.3.0-release-runbook.md` 的版本号仍写 `0.3.2`；后续应更新为 V3.9/异步 OCR 实际状态，避免运维按旧同步链路操作。
- 当前目录混有 Vite Web 项目、旧云函数与小程序/CloudRun 主链路。主生产链路是 `miniprogram/ + ai-mediator-backend/cloudrun/`；修改前先确认目标，不要误把 Web 演示端或旧云函数当作正式后端。

### P2：产品与模型质量

- 千问视觉输出要求 JSON；若模型偶发输出非 JSON，当前会回退腾讯 OCR。可继续增加 JSON 修复/重试，但必须保持总重试上限和成本上限。
- 说话人识别基于聊天气泡左右位置，深色主题、群聊、转发和异形截图仍可能误判。OCR 校对页应继续突出显示不确定块，并允许用户改正。
- 当前知识库是小型代码内标签检索，适合通用调解与安全提示。只有在人工审核条目达到数百条且标签检索不足时，才评估向量检索；绝不把用户聊天文本做跨案件训练/共享。
- 图片默认上限 100 张，长案件可能需要按批次摘要和更明确的“本次仅分析至第 N 版证据”的产品提示。

## 9. 后续 AI 的安全操作清单

1. 先阅读本文件、`README.md`、`CHANGELOG.md`、`docs/v0.3.0-architecture.md` 和 `database-rules/README.md`。
2. 先执行只读检查：`git status --short`、`git diff --check`、确认小程序和 CloudRun 版本号，再决定编辑范围。
3. 当前工作目录脏时，优先在干净 V3.9 工作树修改、测试、提交、推送；若必须同步回当前目录，仅复制明确列出的文件，并先做时间戳备份与哈希校验。
4. 任何 CloudRun 配置、数据库规则、服务访问类型、密钥、实例数量或公网入口变更，都必须先说明影响和回滚方式，再执行；部署后复核 `MINIAPP` 私有访问。
5. 任何数据库写操作都必须经后端鉴权与案件参与者校验；不要恢复客户端直接创建 `messages`、`analyses`、`evidence` 或 `ocr_jobs`。
6. 提交时只暂存指定文件，绝不使用 `git add .` 或 `git add -A`；提交前做真实密钥扫描。
7. 变更 OCR 时必须保持：云存储文件归属校验、异步任务、幂等键、租约、页面恢复、去重和腾讯回退。不可因为单个测试失败而重新引入同步长耗时 OCR。
8. 变更产品文案时不得宣称“绝对匿名”“一定准确”“秒出结果”“绝对保密”“法律结论”或其他无法保证的承诺。

## 10. 推荐的下一次执行顺序

1. 让用户重启 / 重新部署 CloudRun `ai-mediator-backend`，确认线上不再是 `006`，并保持 `MINIAPP`。
2. 让用户上传小程序 `0.3.10`，在公众平台设为体验版，清除缓存后重扫进入。
3. 用真实手机截图或 `1/` 目录测试图片走完 OCR 端到端链路，验证「继续识别这批截图」可恢复。
4. 若 OCR 失败，先收集不含聊天内容的 `jobId`、状态、错误码和时间，再查 CloudRun 与 `ocr_jobs` 状态；不要凭感觉继续改超时参数。
5. 真机稳定后，更新 V3 发布手册版本并补充异步 OCR 回归项。
6. 轮换所有曾在聊天或本机脚本中暴露的凭据，并验证新凭据在 CloudRun 环境变量生效。
7. 观察一段体验版数据后，再决定是否开启更完整日志/告警，以及何时淘汰旧 OCR 兼容路径。

## 11. 有用的命令

```powershell
# 主测试
npm run test:all
npm run build

# 只测 CloudRun
npm test --prefix ai-mediator-backend/cloudrun

# 检查小程序是否又使用了旧编译器不支持的语法
rg '\?\.|\?\?' miniprogram -g '*.js'

# 检查改动的空白错误
git diff --check

# 查看当前目录是否混入了非预期修改（只读）
git status --short

# 加载本机 CloudBase 凭据（env.txt 已 gitignore）
cd "D:/4.开发工具/code/ai-mediator/ai-mediator-backend/cloudrun"
set -a && . ./env.txt && set +a

# 确认/创建 ocr_jobs（需要上面的 env 已加载）
npm run db:ensure-collections

# 确认 env.txt 确实被忽略
git check-ignore ai-mediator-backend/cloudrun/env.txt
```

---

维护原则：先保护用户隐私和案件隔离，再保证可恢复性与正确性，最后再做模型效果、速度和视觉优化。
