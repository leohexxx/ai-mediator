# AI 调解小程序 — CloudRun 重构技术方案

> 文档版本: v1.0  
> 日期: 2026-07-15  
> 状态: 待评审

---

## 1. 背景与问题

### 1.1 当前架构

```
小程序 ── wx.cloud.callFunction ──→ 云函数(60~120s) ──→ DeepSeek API (外网)
                                      ├── OCR.space API (外网, 免费版)
                                      ├── wx.createVideoDecoder 抽帧
                                      └── 3 阶段流水线 (链式/顺序)
```

### 1.2 核心问题

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| 1 | **分析频繁超时** | 云函数硬限 60/120s vs LLM 生成 30-90s | 用户等待后失败 |
| 2 | **假进度条 / 卡住** | 阶段链式触发被运行时取消 | 用户感知"坏了" |
| 3 | **网络不稳定** | WeChat Cloud → DeepSeek 跨外网 | 偶发 5-30s 延迟 |
| 4 | **视频 OCR 太慢** | 客户端逐帧抽帧+OCR，串行 | 长视频处理几分钟 |
| 5 | **客户端轮询进度** | DB 轮询替代推送 | 浪费写入，延迟高 |
| 6 | **微信生态耦合太深** | 云函数只能跑在微信云环境 | 调试/测试困难 |

### 1.3 根因本质

> **云函数（Serverless Functions）的设计范式是「短平快」：秒级响应、轻量计算。  
> 而 LLM 分析是「重型异步任务」：30-120 秒计算、IO 密集、结果延迟返回。  
> 两者是架构层面的不匹配，无法通过调参解决。**

---

## 2. 目标架构

### 2.1 总体方案

**将分析、OCR、聊天等重型计算从云函数迁移到 CloudRun（云托管容器化后端），  
云函数仅保留登录 / 轻量 CRUD / OPENID 获取。**

```
┌─────────────────────────────────────────────────────────────┐
│                        微信小程序                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 上传证据  │  │ 分析报告  │  │ 聊天对话  │  │ 案例列表  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │         │
└───────┼─────────────┼─────────────┼─────────────┼─────────┘
        │ wx.request  │ wx.request  │ WebSocket   │ wx.cloud
        │ (POST)      │ (GET)       │ (实时推送)   │ .callFunction
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                   CloudRun Docker 容器                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                Express.js API 服务                    │   │
│  │  POST /api/analyze         ─ 启动/重新分析           │   │
│  │  GET  /api/analysis/:id    ─ 查询分析结果            │   │
│  │  POST /api/upload/ocr      ─ 图片上传+OCR            │   │
│  │  POST /api/upload/video    ─ 视频上传+抽帧+OCR       │   │
│  │  WS   /ws/analysis/:id     ─ WebSocket 推送进度       │   │
│  │  POST /api/chat            ─ 对话式分析              │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│  │  │ LLM 服务  │  │ OCR 服务  │  │ 视频抽帧  │           │   │
│  │  │ (DeepSeek │  │ (OCR.space│  │ (ffmpeg  │           │   │
│  │  │  / 混元)  │  │  / 腾讯)  │  │ 云端)    │           │   │
│  │  └──────────┘  └──────────┘  └──────────┘           │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
                     ┌──────────────────┐
                     │ 共享数据库 (NoSQL)│
                     │ cases / analyses │
                     │ evidence / ……    │
                     └──────────────────┘

┌──────────────────────────────┐
│ 微信云函数 (保留极简)         │
│  login        ─ 获取 OPENID  │
│  getCaseDetail ─ 读 DB       │
│  createCase   ─ 建案例       │
└──────────────────────────────┘
```

### 2.2 核心原则

1. **云函数只做「微信专用」的事**——登录鉴权、OPENID 关联、简单读 DB。其余全移到 CloudRun。
2. **CloudRun 完全解耦**——独立的 Express/Node.js 服务，可本地开发调试，不依赖微信环境。
3. **异步 + 实时推送**——分析启动即返回 analysisId，进度通过 WebSocket 推送，客户端不再轮询 DB。
4. **单次 LLM 调用**——不分 3 阶段、不链式触发、无 fire-and-forget hack。一次完整分析一次 LLM 调用，多久都行。
5. **OCR 和视频抽帧放后端**——ffmpeg 抽帧速度比 `wx.createVideoDecoder` 快 5-10 倍。

---

## 3. 详细设计

### 3.1 API 接口设计

```
Base URL: https://<your-cloudrun-domain>.tcloudbaseapp.com/api
```

#### 3.1.1 分析模块

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/analyze/start` | POST | 启动分析，返回 analysisId |
| `/api/analyze/:id` | GET | 获取分析结果 |
| `/api/analyze/:id/ws` | WebSocket | 实时进度推送 |

**`POST /api/analyze/start`**

```json
{
  "caseId": "xxx",
  "deep": false,
  "openid": "用于鉴权"
}

// 响应
{
  "code": 0,
  "data": {
    "analysisId": "abc123",
    "status": "analyzing"
  }
}
```

**WebSocket `/api/analyze/abc123/ws`**

```json
// 服务端推送给客户端
{ "event": "progress", "data": { "step": "分析中", "progress": 10 } }
{ "event": "progress", "data": { "step": "正在分析性格与判断...", "progress": 40 } }
{ "event": "progress", "data": { "step": "正在提取证据与情绪...", "progress": 70 } }
{ "event": "progress", "data": { "step": "正在制定策略...", "progress": 90 } }
{ "event": "done", "data": { "analysisId": "abc123", "result": {...完整分析结果...} } }
{ "event": "error", "data": { "message": "..." } }
```

#### 3.1.2 上传 & OCR 模块

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/upload/ocr-images` | POST | 多图上传 + OCR（multipart） |
| `/api/upload/video` | POST | 视频上传 + 云端抽帧 + OCR（multipart） |
| `/api/upload/text` | POST | 文本直接上传 |

**`POST /api/upload/ocr-images`**

```
Content-Type: multipart/form-data
fields: caseId, images[] (最多20张)

// 响应
{
  "code": 0,
  "data": {
    "text": "合并后的OCR文字...",
    "fileUrls": ["https://...", "..."],
    "messageCount": 68
  }
}
```

**`POST /api/upload/video`**

```
Content-Type: multipart/form-data
fields: caseId, video

// 服务端用 ffmpeg 抽帧（固定间隔 + OCR，~20 帧并行 OCR）
// 响应同 ocr-images
```

**视频抽帧策略（后端 ffmpeg）**：

```
ffmpeg -i input.mp4 -vf fps=0.5 -vsync vfr -q:v 2 frames/frame_%04d.jpg
```
- 0.5 fps = 每 2 秒一帧（比客户端 decode+seek 快 5-10 倍）
- 限制最多 30 帧
- 帧图像直接 base64 → 并行 OCR（Promise.all，非串行）

#### 3.1.3 对话模块

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/chat` | POST | 继续对话分析 |
| `/api/chat/ws` | WebSocket | 流式对话 |

### 3.2 数据流：完整分析流程

```
用户选择截图
    │
    ▼
POST /api/upload/ocr-images
    ├── 上传图片至云存储
    ├── (后端) OCR.space / 腾讯OCR 并行识别
    └── 返回合并文本
    │
    ▼
小程序显示识别结果 → 用户确认/编辑
    │
    ▼
POST /api/analyze/start  { caseId }
    ├── 创建 analysis 记录
    ├── 返回 { analysisId, status: 'analyzing' }
    │
    ▼  (异步, 不阻塞)
后端分析流水线（同一次 HTTP 请求内完成）：
    ├── ① 获取证据 → 格式化聊天记录
    ├── ② 调用 DeepSeek 完整分析 (1次调用, 30-90s)
    │     不分阶段、不链式、await 到底
    │     (或分2次: 核心判断 + 证据策略, 但仍在一次请求内)
    ├── ③ 写数据库 (analysis.complete)
    └── 通过 WebSocket 推送实时进度
    │
    ▼
小程序收到 ws:done → 渲染结果
```

### 3.3 WebSocket 进度推送

相比当前方案的"云函数写 DB → 客户端 1s 轮询"：

```
当前方案:
  云函数: DB.write(progress.core) → 结束 → DB.write(progress.done)
  小程序: setInterval(DB.read, 1000) → 发现变化 → setData

CloudRun 方案:
  服务端: ws.send({ event:'progress', data:{step:'core'} })
  小程序: wx.onSocketMessage → setData  (0 延迟)
```

优势：
- **实时**（10ms 推送到客户端 vs 1s 轮询间隔）
- **省读写**（不浪费 DB 写入来推进度，最终结果才写一次 DB）
- **简单**（小程序端 `wx.connectSocket` + `onSocketMessage` 即可）

### 3.4 Dockerfile 与部署

```dockerfile
FROM node:20-alpine

# 安装 ffmpeg（视频抽帧用）
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .

ENV PORT=9000
EXPOSE 9000

CMD ["node", "server.js"]
```

**关键配置**：
- 端口 `9000`（CloudRun 默认端口规范）
- 最小实例数 `1`（避免冷启动延迟）
- 最大实例数 `5-10`（按用户量调整）

### 3.5 包依赖

```json
{
  "dependencies": {
    "express": "^4.18",
    "ws": "^8.16",
    "mongoose": "^8.0",
    "multer": "^1.4",
    "fluent-ffmpeg": "^2.1",
    "sharp": "^0.33"
  }
}
```

---

## 4. 与当前方案的改动对比

| 维度 | 当前（云函数） | CloudRun |
|------|---------------|----------|
| **分析超时** | 硬限 120s，超时即死 | 无限制（可设 10min） |
| **分阶段** | 必须分 3 阶段（否则超时） | 不分阶段，一次完整调用 |
| **链式触发** | cloud.callFunction 自调用（不可靠） | 不需要 |
| **进度推送** | DB 轮询（1s 间隔） | WebSocket 实时推 |
| **视频抽帧** | 客户端 decode+seek（慢） | 后端 ffmpeg（快 5-10x） |
| **照片 OCR** | 客户端逐个串行 | 后端并行 |
| **DeepSeek 延迟** | 云函数 → 外网（2-15s） | CloudRun → 外网（可能更快） |
| **本地调试** | 需部署到微信云 | `npm run dev` 本地跑 |
| **混合云** | 只能用微信云工具链 | 标准 Docker，可迁到任意云 |
| **部署方式** | tcb fn deploy | tcb cloudrun deploy 或 docker push |

---

## 5. 分阶段实施计划

### Phase 1：搭建 CloudRun 基础（1-2 天）

```
目录结构：
  cloudrun/
    ├── Dockerfile
    ├── package.json
    ├── server.js           ← Express 入口
    ├── routes/
    │   ├── analyze.js      ← 分析 API
    │   ├── upload.js       ← 上传/OCR API
    │   └── chat.js         ← 对话 API
    ├── services/
    │   ├── llm.js          ← LLM 调用封装
    │   ├── ocr.js          ← OCR 封装
    │   ├── video.js        ← 视频抽帧封装
    │   └── db.js           ← DB 操作
    └── config.js           ← 配置（env var 读取）
```

1. 创建 `cloudrun/` 目录 + Express 基础框架
2. 实现 `POST /api/upload/ocr-images`（图片 OCR，后端并行）
3. 实现 `POST /api/upload/video`（ffmpeg 抽帧 + OCR）
4. 部署 CloudRun 服务

### Phase 2：迁移分析流水线（2-3 天）

1. 实现 `POST /api/analyze/start`（单次 LLM 调用）
2. 实现 WebSocket 进度推送
3. 去掉云函数 analyzeCase 的分阶段/链式 hack
4. 小程序端：`callFunction` → `wx.request` + `wx.connectSocket`

### Phase 3：清理与优化（1 天）

1. 删除不再需要的云函数/目录
2. 调优 CloudRun 实例数/cpu/内存
3. 接入腾讯混元模型（可选，内网调用更稳）

---

## 6. 成本和性能估算

### 6.1 CloudRun 月费

| 配置 | 单价 | 月估费 | 说明 |
|------|------|--------|------|
| 0.25 核 / 512MB | ¥0.054/小时 | **~¥40** | 最低配，够 1-10 日活用户 |
| 0.5 核 / 1GB | ¥0.108/小时 | **~¥80** | 推荐，10-50 日活 |
| 1 核 / 2GB | ¥0.216/小时 | **~¥160** | 50-200 日活 |
| 最小实例 1 | ¥0.054/小时(保底) | ~¥40 | 避免冷启动 |

**推荐配置**：0.5 核 / 1GB + 最小实例 1 ≈ **¥80-120/月**

### 6.2 与当前方案比

| 项目 | 当前（云函数+免费OCR） | CloudRun |
|------|----------------------|----------|
| 服务器 | 基本免费 | ~¥80-120/月 |
| LLM API 费用 | ¥200-500/月（取决于使用量） | 不变 |
| OCR 费用 | 免费（OCR.space 免费版） | 免费 或 腾讯OCR ~¥0.01/次 |
| **总费用** | **~¥300/月** | **~¥400-600/月** |
| **稳定性** | ❌ 经常超时 | ✅ 99.9% |
| **用户体验** | ❌ 1-3 分钟+卡住 | ✅ 30-60s，进度实时 |
| **开发效率** | ❌ 不能本地调试 | ✅ npm run dev |

### 6.3 性能预期

| 场景 | 当前耗时 | CloudRun 预期 |
|------|---------|--------------|
| 68 条消息分析 | 60-90s（经常超时） | **25-40s** |
| 200 条长文本分析 | 120s+（必超时） | **40-60s** |
| 5 张截图 OCR | 15-25s | **5-10s**（后端并行） |
| 1 分钟录屏抽帧 OCR | 60-120s | **15-30s**（ffmpeg + 并行） |

---

## 7. 风险与备选

### 7.1 风险

| 风险 | 概率 | 应对 |
|------|------|------|
| DeepSeek 外网延迟仍然高 | 中 | 切换腾讯混元（内网不走外网） |
| CloudRun 冷启动慢（>5s） | 低 | 设最小实例 1，预热 |
| CloudRun 费用超预期 | 低 | 按量计费，空闲无流量自动缩到 0 |
| 迁移期间新老系统并存 | 中 | 按 case 维度灰度，老系统作 fallback |
| WebSocket 在小程序后台被断 | 低 | 断线重连 + 最终结果靠 GET 兜底 |

### 7.2 备选方案

| 方案 | 优点 | 缺点 |
|------|------|------|
| **vGPU 云服务器（CVM）** | 性能最好，¥50/月 | 自己管运维 |
| **Lighthouse 轻量服务器** | ¥34/月起，稳定 | 无自动扩缩容 |
| **继续优化云函数** | 不换架构 | 天花板太低 |

---

## 8. 决策建议

**强烈推荐 CloudRun 方案**，原因：
1. 同一腾讯云账号，无需新平台
2. 微信登录/DB 全复用，不改小程序架构
3. 无超时限制，治本
4. 从 ¥80/月开始，与用户量和收入匹配

**不建议继续在云函数上优化**——120s 天花板、外网延迟、不能本地调试是架构缺陷，不是调参能解决的。

---

## 附录 A：小程序端改动概要

### 小程序端需要改的

```js
// 当前 (云函数)
wx.cloud.callFunction({
  name: 'analyzeCase',
  data: { caseId: 'xxx' }
}).then(res => { ... })

// 改后 (CloudRun HTTP API + WebSocket)
// 1. 启动分析
wx.request({
  url: 'https://xxx.tcloudbaseapp.com/api/analyze/start',
  method: 'POST',
  data: { caseId: 'xxx', openid: openid }
}).then(res => {
  const analysisId = res.data.data.analysisId;
  // 2. 连接 WebSocket 接收进度
  connectWebSocket(analysisId);
});

function connectWebSocket(analysisId) {
  const ws = wx.connectSocket({
    url: 'wss://xxx.tcloudbaseapp.com/api/analyze/' + analysisId + '/ws'
  });
  ws.onMessage(msg => {
    const event = JSON.parse(msg.data);
    if (event.event === 'progress') updateProgress(event.data);
    if (event.event === 'done') renderResult(event.data.result);
    if (event.event === 'error') showError(event.data.message);
  });
}
```

### 改动量

| 页面 | 改动内容 | 行数 |
|------|---------|------|
| `services/analysis.js` | callFunction → wx.request + WebSocket | ~30 行 |
| `services/evidence.js` | callFunction → wx.request（上传+OCR） | ~20 行 |
| `pages/report/report.js` | 去掉 DB watch，改为 WebSocket 监听 | ~40 行 |
| `pages/upload/upload.js` | 上传改为 HTTP multipart | ~30 行 |
| **总计** | | **~120 行** |

---

> **文档结束** — 如有任何疑问或需要深入某个技术细节，请提出讨论。
