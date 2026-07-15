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

## 关键 Bug 修复总结（2026-07-14）

### 分析流水线（最重要）
- `analyzeCase` 云函数使用 **顺序流水线** `runSequentialPipeline`，同一调用内串行 core→evidence→strategy
- DeepSeek Flash 每阶段 ~10-27s，3 阶段合计 ~30-64s，云函数 timeout=120s 足够
- **主入口 await 整个流水线**（主函数 await pipeline 直到三阶段全部完成后再返回）
  - `handleInitial` 先创建记录并返回结果（<1s）
  - `exports.main` 收到结果后 `await runSequentialPipeline`
  - 客户端在 `callFunction` 之后立即导航走，不等返回
  - 云函数 120s timeout > pipeline ~55s，不会被掐
- **不做 `cloud.callFunction` 自调用**（ESOCKETTIMEDOUT 根源）
- 深度模式 Pro 降级用**同调用内直接重试**（`return await handleCore(..., true)`）
- `_input.chatText` 必须截断到 ≤8000 字符（`slice(0, 8000)`）

### 超时设置
- `llm.js` 中 `STAGE_TIMEOUT_MS` = 50000
- `cloudbaserc.json` 中 `analyzeCase` timeout = 120
- `cloudbaserc.json` 中 `chatWithAnalysis` timeout = 60

### DNS / 环境变量陷阱
- `api.tokenhub.market` DNS 错误：代码中无该域名引用，由 CloudBase 残留 `LLM_BASE_URL` 导致
- **必须**在部署脚本中显式设置 `LLM_BASE_URL=https://api.deepseek.com/v1` 覆盖旧值
- `setkeys.sh` 和 `deploy.sh` 都必须显式设置 LLM_BASE_URL

### 证据阶段（evidence）耗时最高
- evidence 耗时 22-26s，占总时间 ~50%，是计算瓶颈
- maxTokens 已从 3584 压缩到 2560，要求项数精简
- 预计可提速 8-10s

### 报告页轮询保底
- `report.js`: 添加 `_startPolling` 每 3 秒查一次 DB，作为 watch 的保底
- 分析完成后自动停止轮询并刷新完整报告

### 视频抽帧
- 最大帧数 maxFrames = 12（不能为 20）
- OCR 并发控制 MAX_CONCURRENT = 3（不能全部并行）

### createCase
- 单人模式初始状态 = `waiting_submission`（不是 `single_submitted`）
- `uploadEvidence` 提交后自动变为 `single_submitted`
