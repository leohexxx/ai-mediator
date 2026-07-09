# ⚖️ AI 调解员

上传微信聊天截图/录屏，AI 分析人物关系、判断对错、给出中肯建议。

## 功能

- 📸 **截图上传** — 支持微信聊天截图拖拽/粘贴上传，自动 OCR 提取文字
- 🎬 **录屏识别** — 上传录屏自动提取关键帧并进行 OCR 识别
- 👥 **人物识别** — 自动识别对话中的各方人物及其关系
- ⚖️ **仲裁分析** — AI 客观分析谁对谁错，给出评分和理由
- 💬 **交互式追问** — 分析后可继续向 AI 追问细节
- 📎 **证据补充** — 支持追加证据触发重新分析

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| OCR | Tesseract.js (客户端) |
| 后端 | Node.js + Express + TypeScript |
| AI | Claude API / Anthropic API |
| 存储 | IndexedDB (浏览器端) |

## 快速开始

### 1. 安装依赖

```bash
# 前端
npm install

# 后端
cd server
npm install
```

### 2. 配置环境变量

```bash
cd server
cp .env.example .env
# 编辑 .env 填入你的 ANTHROPIC_API_KEY
```

### 3. 启动开发服务器

```bash
# 终端 1: 启动后端 (端口 3001)
cd server
npm run dev

# 终端 2: 启动前端 (端口 3000)
npm run dev
```

打开 http://localhost:3000

## 使用流程

1. 点击「新建调解案例」
2. 输入双方姓名和关系类型
3. 上传聊天截图或录屏（支持双方分别上传）
4. 点击「开始分析」
5. 查看分析报告（摘要、人物画像、时间线、仲裁结果、建议）
6. 在聊天框中追问细节
7. 可补充证据触发重新分析

## 阶段规划

- ✅ **Phase 1 — MVP** (当前): Web 应用，截图上传 + OCR + AI 分析 + 交互式追问
- 🔜 **Phase 2 — 增强**: 录屏帧提取优化、语音消息 STT、PWA 离线支持
- 🔜 **Phase 3 — 原生**: Capacitor iOS/Android 打包，上架应用商店

## 项目结构

```
app/
├── src/
│   ├── components/     # UI 组件
│   ├── pages/          # 页面
│   ├── hooks/          # 自定义 hooks
│   ├── services/       # API 客户端
│   ├── utils/          # 工具函数 (OCR, 存储)
│   └── types/          # TypeScript 类型定义
├── server/
│   └── src/
│       ├── routes/     # API 路由
│       └── services/   # 聊天解析, LLM 服务
└── docs/
    └── superpowers/
        ├── specs/      # 设计规格文档
        └── plans/      # 实现计划
```
