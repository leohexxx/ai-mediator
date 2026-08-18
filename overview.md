# 增量 v2 交付总结

**日期**: 2026-07-15  
**交付内容**: 追问安全提示 + 字数文案更正 + 补充背景 + 双人辩论模式 + 调解方向调整

---

## ✅ 4 项需求全部交付

### 需求 1：追问环节安全提示 + 措辞约束
- AI 追问回复开头展示隐私安全提示（首次完整版，后续简版）
- 追问回答避免"可能""或许""也许"等模糊词汇
- 回答偏积极正面但保持客观

### 需求 2：字数文案更正
- 1 万字明确为**建议**而非**强制**
- 超限提示改为"建议提取关键信息可缩短分析时间"

### 需求 3：上传后补充背景/问题
- 备注区文案升级为引导性提示："📝 说说你的想法"
- maxlength: 500 → 1000
- 备注内容完整注入 AI 分析上下文中

### 需求 4：双人辩论模式 + 调解方向
- **双人模式彻底重构**：甲方可先上传先分析（状态 `dual_a_submitted`）
- 乙方补充后触发**辩论式重新分析**（状态 `dual_b_submitted`）
- 辩论模式 LLM 对比双方证据
- 调解方向偏积极正面但不失客观

## 修改文件（共 10 个）

| 文件 | 变更 |
|------|------|
| `cloudfunctions/common/prompts/chatPrompt.js` | 安全提示 + 措辞约束 + safetyShown 参数 |
| `cloudfunctions/common/prompts/analysisPrompt.js` | 调解方向 + buildDebateContextBlock |
| `miniprogram/utils/format.js` | statusLabel 新增 dual_a_submitted/dual_b_submitted |
| `miniprogram/pages/upload/upload.wxml` | 相册提示 + 备注区文案/maxlength |
| `miniprogram/pages/upload/upload.js` | toast + 弹窗文案 |
| `miniprogram/pages/case-detail/case-detail.js` | 新状态适配 |
| `cloudfunctions/analyzeCase/index.js` | note→caseContext + 辩论状态机 |
| `cloudfunctions/uploadEvidence/index.js` | 双人自动分析 + 辩论模式触发 |
| `cloudfunctions/getCaseDetail/index.js` | 权限放宽 |
| `cloudfunctions/chatWithAnalysis/index.js` | safetyShown 传递 |

## QA 结果
- Round 1: 发现 1 个源码Bug（变量作用域）→ 修复
- Round 2: ✅ 全部 27 项通过
