# 小程序适配说明

将本目录的文件替换到小程序项目中对应的文件，完成后端从云函数切换到 CloudRun。

## 替换清单

| 原文件 | 替换为 | 改动说明 |
|--------|--------|----------|
| `miniprogram/services/analysis.js` | `services/analysis.js` | `wx.cloud.callFunction` → `wx.request` + WebSocket |
| `miniprogram/services/evidence.js` | `services/evidence.js` | `wx.cloud.callFunction` → `wx.uploadFile` / `wx.request` |

## 配置

在 `services/analysis.js` 中修改：

```js
var CLOUD_RUN_BASE = 'https://your-cloudrun-domain.tcloudbaseapp.com/api';
//                      ↑ 替换为实际 CloudRun 域名
```

## 报告页改动

原 `pages/report/report.js` 中：

1. 将 `watchAnalysisProgress` 的监听方式从 DB 轮询改为 WebSocket
2. `onManualAnalyze` / `onRetryAnalyze` 中调用 `analysisService.analyzeCase` 不变
3. 改用 `onProgress` / `onDone` 回调更新页面

参考服务端 WebSocket 协议：

```js
// 客户端发
{ "type": "subscribe", "analysisId": "xxx" }

// 服务端推
{ "event": "progress", "data": { "step": "...", "progress": 40 } }
{ "event": "done",    "data": { "analysisId": "xxx", "result": {...} } }
{ "event": "error",   "data": { "message": "..." } }
```

## 上传页改动

原 `pages/upload/upload.js` 中：

1. `onChooseMedia` → 图片上传改为 `wx.uploadFile` 到 `POST /api/upload/ocr-images`
2. `onChooseVideo` → 视频上传改为 `wx.uploadFile` 到 `POST /api/upload/video`
3. 去掉 `_extractAndOcrVideoFrames`（移至服务端）
4. 去掉 `_ocrFrameBatch`（移至服务端）
5. `onSubmit` → 文本上传改为 `wx.request` 到 `POST /api/upload/text`

## 云函数清理

切换完成后，以下云函数可以删除或停用：

| 云函数 | 替代 |
|--------|------|
| `analyzeCase` | `POST /api/analyze/start` |
| `chatWithAnalysis` | `POST /api/chat` |
| `ocrImage` | `POST /api/upload/ocr-images` / video |
| `uploadEvidence` | 合并到 `POST /api/upload/*` 中 |
| `updatePersonality` | 可选保留（轻量 CRUD） |

保留 `login`、`getCaseDetail`、`createCase` 等轻量函数（或也逐渐迁移到 CloudRun API）。
