# AI Mediator Backend — CloudRun 重构版

## 目录结构

```
ai-mediator-backend/
├── cloudrun/                    # CloudRun 后端服务
│   ├── server.js                # Express 入口
│   ├── config.js                # 配置（环境变量）
│   ├── Dockerfile               # 容器构建
│   ├── docker-compose.yml       # 本地开发
│   ├── package.json
│   ├── .env.example
│   ├── routes/
│   │   ├── health.js            # GET  /api/health
│   │   ├── analyze.js           # POST /api/analyze/start
│   │   │                       # GET  /api/analyze/:id
│   │   ├── upload.js            # POST /api/upload/ocr-images
│   │   │                       # POST /api/upload/video
│   │   │                       # POST /api/upload/text
│   │   └── chat.js              # POST /api/chat
│   ├── services/
│   │   ├── db.js                # 数据库（CloudBase NoSQL / 本地JSON）
│   │   ├── analysisWorker.js    # 数据库租约、重试与恢复扫描
│   │   ├── analysisPipeline.js  # 可重入分析流水线
│   │   ├── caseAccess.js        # 案例参与者访问控制
│   │   ├── llm.js               # DeepSeek / 混元 API 调用
│   │   ├── ocr.js               # 图片 OCR（ocr.space / 腾讯OCR）
│   │   └── video.js             # ffmpeg 视频抽帧
│   ├── middleware/
│   │   ├── auth.js              # 微信登录鉴权
│   │   └── errorHandler.js      # 全局错误处理
│   └── utils/
│       └── chatFormatter.js     # 聊天记录解析
│
├── scripts/
│   ├── setup.sh                 # 本地开发环境初始化
│   └── deploy.sh                # Docker 构建 + CloudRun 部署
│
└── README.md
```

## 快速开始

### 1. 本地开发

```bash
# 克隆后
cd cloudrun
cp .env.example .env    # 编辑填入你的 API Key
npm install
npm run dev              # http://localhost:9000
```

### 2. 配置环境变量

编辑 `cloudrun/.env`：

```bash
# 必填：LLM API keys
LLM_API_KEYS=sk-xxx,sk-yyy,sk-zzz
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash

# CloudBase 环境 ID（部署后填）
CLOUDBASE_ENV_ID=cloudbase-xxxxx
CLOUDBASE_APIKEY=<server-api-key>

# 腾讯高精度 OCR
TENCENT_OCR_SECRET_ID=<secret-id>
TENCENT_OCR_SECRET_KEY=<secret-key>
```

### 3. API 验证

```bash
curl http://localhost:9000/api/health
# {"code":0,"data":{"status":"ok","mode":"local"}}

# 上传聊天文本
curl -X POST http://localhost:9000/api/upload/text \
  -H "Content-Type: application/json" \
  -d '{"caseId":"test","text":"2024-01-15 14:30 张三: 你好\n2024-01-15 14:31 李四: 你好"}'

# 启动分析（仅 LOCAL_MODE=true 时接受测试身份头）
curl -X POST 'http://localhost:9000/api/analyze/start' \
  -H "Content-Type: application/json" \
  -H "X-Mock-Openid: mock" \
  -d '{"caseId":"test","deep":false}'
```

### 4. 部署到 CloudRun

```bash
# 先开通 CloudRun（云开发控制台 → 云托管）
# 然后构建并推送 Docker 镜像
cd cloudrun
docker build -t ai-mediator-backend .
# 推送到腾讯云容器镜像服务...
```

生产环境必须配置 `CLOUDBASE_ENV_ID`，连接失败会终止启动，不会降级到容器本地文件。
分析任务使用数据库租约恢复；生产环境建议 CloudRun 最小实例数设为 2、最大实例数 10，使队列持续消费。若允许缩容到 0，
任务仍不会丢失，但要等下一次请求唤醒实例后继续。

详见解锁脚本 `scripts/deploy.sh`。

## 与原架构的核心区别

| 维度 | 原云函数 | CloudRun |
|------|----------|----------|
| 超时 | 60-120s 硬限 | 无限制 |
| 分析 | 分3阶段+链式触发 | 数据库队列 + 租约重试 + 一次 LLM 调用 |
| 分析进度 | 轮询 DB | 持久化状态 + 受权 HTTP 轮询（可后续接入共享推送） |
| 视频抽帧 | 客户端 decode+seek | 服务端 ffmpeg（快 5-10x） |
| OCR | 客户端串行 | 服务端并行 |
| 调试 | 必须部署到微信云 | npm run dev / docker compose |

## 小程序接入步骤

1. 在 `miniprogram/config/cloudrun.js` 中填写 CloudBase 环境 ID 与 CloudRun 服务名，并设置 `enabled: true`
2. 小程序分析服务会通过 `wx.cloud.callContainer` 访问私有 CloudRun，不需要配置公网域名
3. 报告页会通过受权 HTTP 轮询读取已持久化的分析进度
4. 证据、OCR、分析和追问均通过私有 CloudRun；旧云函数仅保留为紧急回滚链路

## 技术栈

- **运行时**: Node.js 20 + Express
- **进度读取**: 持久化状态 + 受权 HTTP 轮询
- **数据库**: CloudBase NoSQL（@cloudbase/node-sdk）；仅显式 `LOCAL_MODE=true` 时使用本地 JSON
- **LLM**: DeepSeek API（多 key 轮询 + 故障切换）
- **OCR**: 腾讯高精度 OCR（长图分块、置信度校对、哈希去重）
- **视频**: ffmpeg 云端抽帧
- **部署**: Docker + CloudRun（腾讯云托管）
