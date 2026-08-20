# 原版本 GitHub 备份完成

日期：2026-08-19

## 完成内容
- 确认原版本基线为干净目录 `D:/4.开发工具/code/ai-mediator-v0.2.0` 的提交 `45fef47`，标签为 `v0.3.9`。
- 未使用当前 `ai-mediator` 脏工作树进行全量提交。
- 已将 `45fef47` 推送到 GitHub 备份分支：`backup/v0.3.9-original-20260819`。

## 核验结果
- 远程备份分支哈希：`45fef475f2ea75f3e461db82f618f4271e2f4134`
- 远程 `v0.3.9` 标签哈希：`7e915876ef04ced0ca5f1628a97a4c65156bd241`
- 备份目录仅保留两个未跟踪的本地部署配置目录，未进入提交。
- 当前工作目录原有大量修改保持不变，未执行清理、重置或覆盖。

## 本轮 OCR 修复与验证（2026-08-19）
- 确认截图主路径为：云存储上传 → `POST /api/upload/ocr-jobs` 返回 `202` → OCR Worker 后台执行 → 小程序轮询；主通道是千问视觉 `qwen3.8-max`，失败回退腾讯高精度 OCR。
- OCR 创建任务接口不再同步查询历史 `evidence_batches`，案件权限和幂等查询并行执行；客户端 `102002` 重试复用同一幂等键。
- 新增不记录聊天内容/图片内容的结构化 OCR 事件：`ocr_job_queued`、`ocr_job_started`、`ocr_job_completed`、`ocr_job_failed`，用于真机失败按 `jobId` 定位。
- 本轮验证：小程序 19/19、CloudRun 37/37、云函数 5/5；OCR 路由、Worker、Pipeline JavaScript 语法检查通过。

## 本轮集合缺失修复（2026-08-19）
- 真机错误确认目标 CloudBase 环境缺少 `ocr_jobs` 集合，异步 OCR 任务没有真正落库，因此此前“任务记录已经保留”的提示不准确。
- 新增 `ai-mediator-backend/cloudrun/scripts/ensure-collections.js` 与 `db:ensure-collections` 脚本，用于在服务端凭据下创建/检查 `ocr_jobs`。
- 服务端将集合缺失转换为 HTTP 503、`OCR_COLLECTION_NOT_READY`，客户端显示明确的管理员处理提示。
- 图片已上传但任务创建失败时，客户端保存 `pendingOcrFileIds`，上传页显示“继续识别这批截图”，修复集合后无需重新选择图片。
- 本轮验证：小程序 19/19、CloudRun 38/38、初始化脚本本地模式检查通过；修改后的 JavaScript 语法检查通过。

## 下一步
1. 在目标 CloudBase 环境执行 `npm run db:ensure-collections --prefix ai-mediator-backend/cloudrun`。
2. 确认 `ocr_jobs` 集合存在后应用 `database-rules/server-only.json`。
3. 部署 CloudRun 和小程序新版本，再用原页面点击“继续识别这批截图”验证已上传图片。
4. 确认请求路径为 `/api/upload/ocr-jobs`，不要把 OCR 改回同步调用。

## 本轮继续检查（2026-08-19）
- 已读取现有 `ai-mediator-backend/cloudrun/env.txt`，没有要求用户重建或改名；使用其中的目标环境配置成功连接 `cloudbase-d4g5p82875fe1a5ce`。
- 已成功创建生产集合 `ocr_jobs`，结果为 `created: true`、`exists: true`、`count: 0`；随后再次读取验证，集合可访问且当前为空。
- 已将包含密钥的现有 `ai-mediator-backend/cloudrun/env.txt` 加入 `.gitignore`，避免被 Git 提交。
- API Key 可用于 CloudBase 数据库访问和创建集合；集合权限管理需要管理端凭据或控制台操作。需在控制台将 `ocr_jobs` 设置为“仅管理端可读写”，等价于 `server-only.json` 的四项 `false`。
- 重新回归通过：CloudRun OCR 定向测试 4/4，小程序 CloudRun 链路测试 1/1；已确认 `1/` 有 11 张 JPG 测试素材，真实 OCR 端到端测试还需完成权限配置、CloudRun 重新部署和体验版回归。
