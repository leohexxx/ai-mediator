# AI 调解员 (啷个对) — 项目长期记忆

## 项目概况
- 微信小程序"啷个对"（AI 调解员），帮助用户分析聊天纠纷
- 技术栈：微信小程序 + 云开发 (CloudBase) + DeepSeek LLM + OCR.space
- 单人 MVP 模式（从双人协作简化而来）

## 关键架构
- 项目根目录 `D:\4.开发工具\code\app\`，DevTools 打开此目录
- **有两个 project.config.json**：根目录的是 DevTools 实际使用的，`miniprogram/` 下的是冗余
- 根目录 project.config.json 关键配置：`miniprogramRoot: "miniprogram/"`, `cloudfunctionRoot: "cloudfunctions/"`, `libVersion: "2.32.3"`
- `cloudfunctions/common/` 是源文件目录，各云函数的 `common/` 是**副本**
- 修改 `cloudfunctions/common/` 后必须同步到所有云函数的 `common/` 子目录
- 同步方法：`cd cloudfunctions && for dir in */; do cp -rf common/* "${dir}common/" 2>/dev/null; done`
- 云函数 Node.js 运行时不能用 `fetch`，必须用 `https.request`
- LLM 配置：provider=deepseek, FALLBACK_API_KEY 硬编码在 llm.js 中
- login 云函数 v2：用 `cloud.getWXContext()` 获取 openid，不需要 wx.login code
- ocrImage 云函数在 `cloudfunctions/ocrImage/`（不是 miniprogram/cloudfunctions/）

## 常见陷阱
- **基础库 3.16.2 导致 cloud sdk injection skipped**，必须用 2.32.3
- 根目录 project.config.json 必须有 `useApiHook: true` + `useApiHostProcess: true`
- `app.json` 中不能有 `cloudfunctionRoot` 和 `usePrivacyCheck`（基础库 3.16.2+ 报无效警告）
- 云函数 config.json 设置超时：`{"timeout": 60}`（秒）
- OCR.space 免费 API key: `K86789598888957`，OCREngine=2, language=chs
- app.js 必须有 `if (wx.cloud)` 防御性检查，避免基础库不兼容时白屏

## Git 版本线
- `533656d` baseline → `1956cc1` 单人MVP → `308d332` 性格维度 → `1d46c0f` 合规前
- `ac20599` 合规改造 → `c01eb82` 隐私授权修复 → `8cfd722` -604100修复
- `0e45dff` DevTools修复 → `cc8a7da` app.json修复 → `a532302` llm.js修复
