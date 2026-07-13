# 排查总结：AI 分析失败 + OCR 识别率差

## 问题 1：AI 分析一直分析不出来 ✅ 已修复

### 根因
`cloudfunctions/common/llm.js`（已修复版本）从未同步到云函数实际使用的副本目录 `analyzeCase/common/llm.js`。

云函数加载的旧版 `llm.js` 有三个致命差异：

| 对比项 | 修复版 (cloudfunctions/common/) | 旧版 (analyzeCase/common/) |
|--------|-------------------------------|---------------------------|
| 默认 provider | `deepseek` | `anthropic` |
| FALLBACK_API_KEY | 有 (sk-23bd...) | 无（空字符串） |
| HTTP 方式 | `https.request`（原生） | `fetch`（云函数不支持） |

→ 导致 `getConfig()` 返回 `{provider:"anthropic", apiKey:""}` → `analyzeChat` 抛出 "Missing API key"

### 修复
1. 将 `cloudfunctions/common/llm.js` 同步到 `analyzeCase/common/llm.js` 和 `uploadEvidence/common/llm.js`
2. 删除嵌套重复目录 `common/common/`（每个 8 个文件，共 16 个）
3. 集成测试 19/19 通过

### 验证
```
修复前: provider=anthropic, apiKey="" → Missing API key
修复后: provider=deepseek, apiKey=sk-23bd..., model=deepseek-chat ✅
```

---

## 问题 2：OCR 识别率差 ⚠️ 代码无问题，需部署排查

### 排查结果
- **OCR.space API 本地测试**：3.6 秒，855 字中文，识别率完整清晰 ✅
- **图片大小**：124-408KB（base64 后 165-544KB），在 callFunction 1MB 限制内 ✅
- **OCR 云函数代码**：正确使用 `https.request`，参数正确 ✅

### 需要你操作
代码层面没问题，问题在**部署/运行环境**层面：

1. **重新部署 `ocrImage` 云函数**
   - 微信开发者工具 → 云开发 → 云函数 → 右键 `ocrImage` → 上传并部署
   - 同样部署 `analyzeCase` 和 `uploadEvidence`（llm.js 已更新）

2. **检查 OCR.space 免费额度**
   - 免费 API 每月 25,000 次请求
   - 如额度耗尽，需更换 API key 或升级

3. **测试文件夹 `1/` 说明**
   - 包含 9 张聊天截图 + 1 个聊天视频 mp4
   - 视频无法直接 OCR（当前架构只处理图片）
   - 如需视频 OCR，需先抽帧再逐帧识别

---

## 本次修复 Git 记录

```
commit a532302
fix: 修复 AI 分析失败 - llm.js 旧副本默认走 anthropic 且无 API key

19 files changed, 327 insertions(+), 2505 deletions(-)
```
