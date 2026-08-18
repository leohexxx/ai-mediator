# AI Mediator Backend — CloudRun 重构版

## 目录结构

```
ai-mediator-backend/
├── cloudrun/                    # CloudRun 后端服务
│   ├── server.js                # Express 入口 + WebSocket
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
│   │   ├── llm.js               # DeepSeek / 混元 API 调用
│   │   ├── ocr.js               # 图片 OCR（ocr.space / 腾讯OCR）
│   │   └── video.js             # ffmpeg 视频抽帧
│   ├── middleware/
│   │   ├── auth.js              # 微信登录鉴权
│   │   └── errorHandler.js      # 全局错误处理
│   └── utils/
│       └── chatFormatter.js     # 聊天记录解析
│
├── client-adapter/              # 小程序适配代码（替换原文件）
│   ├── services/
│   │   ├── analysis.js          # 替代 callFunction → HTTP + WebSocket
│   │   └── evidence.js          # 替代 callFunction → HTTP multipart
│   └── README.md                # 接入说明
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
```

### 3. API 验证

```bash
curl http://localhost:9000/api/health
# {"code":0,"data":{"status":"ok","mode":"local"}}

# 上传聊天文本
curl -X POST http://localhost:9000/api/upload/text \
  -H "Content-Type: application/json" \
  -d '{"caseId":"test","text":"2024-01-15 14:30 张三: 你好\n2024-01-15 14:31 李四: 你好"}'

# 启动分析（本地模式需传 _openid 参数绕过鉴权）
curl -X POST 'http://localhost:9000/api/analyze/start?_openid=mock' \
  -H "Content-Type: application/json" \
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

详见解锁脚本 `scripts/deploy.sh`。

## 与原架构的核心区别

| 维度 | 原云函数 | CloudRun |
|------|----------|----------|
| 超时 | 60-120s 硬限 | 无限制 |
| 分析 | 分3阶段+链式触发 | 一次 LLM 调用 |
| 进度 | 轮询 DB | WebSocket 实时推送 |
| 视频抽帧 | 客户端 decode+seek | 服务端 ffmpeg（快 5-10x） |
| OCR | 客户端串行 | 服务端并行 |
| 调试 | 必须部署到微信云 | npm run dev / docker compose |

## 小程序接入步骤

1. 将 `client-adapter/services/analysis.js` 和 `evidence.js` 替换到小程序 `miniprogram/services/`
2. 在 `client-adapter/services/analysis.js` 中修改 `CLOUD_RUN_BASE` 为你的 CloudRun 域名
3. 报告页改为使用 WebSocket 接收进度（参考 `client-adapter/services/analysis.js`）
4. 上传页的 `uploadImagesAndOCR` 改为调用新 API

## 技术栈

- **运行时**: Node.js 20 + Express
- **实时通信**: WebSocket (ws 库)
- **数据库**: CloudBase NoSQL（@cloudbase/node-sdk）+ 本地 JSON 文件降级
- **LLM**: DeepSeek API（多 key 轮询 + 故障切换）
- **OCR**: OCR.space / 腾讯OCR
- **视频**: ffmpeg 云端抽帧
- **部署**: Docker + CloudRun（腾讯云托管）
