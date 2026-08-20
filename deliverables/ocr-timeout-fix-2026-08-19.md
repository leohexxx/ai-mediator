# OCR 超时修复与验证记录

日期：2026-08-19
项目版本：0.3.9

## 结论

截图 OCR 当前使用的链路是：

```text
小程序选择截图
  -> 上传到 Cloud Storage
  -> POST /api/upload/ocr-jobs
  -> 快速返回 202 + jobId
  -> CloudRun OCR Worker 后台处理
  -> 千问视觉 qwen3.8-max
  -> 千问失败时回退腾讯高精度 OCR
  -> 小程序轮询 GET /api/upload/ocr-jobs/:id
```

截图主流程不应再同步调用 `/api/upload/ocr-batch`。该旧接口目前只保留给视频抽帧等兼容路径。

## 本轮修改

- OCR 创建任务不再在同步请求中查询历史 `evidence_batches`。
- 案件权限查询与幂等任务查询并行执行。
- 创建任务继续使用 `queued` 持久化状态并返回 HTTP 202。
- 客户端遇到微信 `102002` 时，使用同一幂等键重试一次，避免重复创建任务。
- OCR Worker 在后台加载历史哈希，保留跨批次去重能力。
- 增加不记录聊天文本、图片内容和密钥的结构化事件：
  - `ocr_job_queued`
  - `ocr_job_started`
  - `ocr_job_completed`
  - `ocr_job_failed`
- 增加下载阶段和视觉识别阶段耗时指标。

## 验证结果

- 小程序定向测试：19/19 通过。
- CloudRun 测试：37/37 通过。
- 云函数定向测试：5/5 通过。
- OCR 路由、Worker、Pipeline JavaScript 语法检查：通过。

## 体验版验证清单

1. 确认微信公众平台体验版选择的是 0.3.9，而不是 0.3.8。
2. 清理小程序缓存后重新进入。
3. 选择 1 张截图，确认先看到 `/api/upload/ocr-jobs` 的快速成功响应，再等待轮询完成。
4. 选择 9 张截图，再追加 2 张，确认任务可连续完成。
5. 中途离开上传页再进入，确认 `pendingOcrJobId` 能恢复任务。
6. 如果仍失败，只记录并提供：`jobId`、`caseId`、OCR 状态、错误码、发生时间；不要提供聊天内容或图片。
7. 云端日志中按 `ocr_job_queued`、`ocr_job_started`、`ocr_job_completed`、`ocr_job_failed` 定位。
8. 每次 CloudRun 部署后复查服务访问类型仍为私有 `MINIAPP`。
