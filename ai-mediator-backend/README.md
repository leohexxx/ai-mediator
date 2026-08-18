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
| 分析进度 | 轮询 DB | 持久化状态 + 受权 HTTP 轮询（可后续接入共享推送） |
| 视频抽帧 | 客户端 decode+seek | 服务端 ffmpeg（快 5-10x） |
| OCR | 客户端串行 | 服务端并行 |
| 调试 | 必须部署到微信云 | npm run dev / docker compose |

## 小程序接入步骤

1. 在 `miniprogram/config/cloudrun.js` 中填写 CloudBase 环境 ID 与 CloudRun 服务名，并设置 `enabled: true`
2. 小程序分析服务会通过 `wx.cloud.callContainer` 访问私有 CloudRun，不需要配置公网域名
3. 报告页会通过受权 HTTP 轮询读取已持久化的分析进度
4. 上传/OCR 仍使用现有云函数，待后续阶段完成端到端迁移后再切换

## 技术栈

- **运行时**: Node.js 20 + Express
- **实时通信**: WebSocket (ws 库)
- **数据库**: CloudBase NoSQL（@cloudbase/node-sdk）+ 本地 JSON 文件降级
- **LLM**: DeepSeek API（多 key 轮询 + 故障切换）
- **OCR**: OCR.space / 腾讯OCR
- **视频**: ffmpeg 云端抽帧
- **部署**: Docker + CloudRun（腾讯云托管）
