## BugFix 交付总结

### 🔧 OCR 识别不到文本
**修复内容**：手机端大图（>1600px）canvas 缩放路径添加多层降级兜底
- 5 秒超时 → 降级 `readFile`
- `toDataURL()` 返回空 → 降级 `readFile`  
- `img.onerror` → 降级 `readFile`
- `deploy.sh`: ocrImage/ocrBatch 添加 `sleep 8` 避免 permissions 配置失败

### 📝 AI 提示词术语温和化
**修复内容**：全栈（prompts + UI）移除法官式/情侣式用语
- "甲方/乙方" → 直接使用当事人姓名
- "情侣" 从关系示例中移除
- "案件背景" → "对话背景"
- "争议话题" → "分歧话题"  
- "证据" 显示描述 → "沟通内容"（JSON 字段名不变）
- 首页 "吵架了？让 AI 来评评理" → "有分歧？让 AI 来分析"

### 涉及文件
| 文件 | 改动 |
|------|------|
| `miniprogram/services/evidence.js` | OCR canvas 超时兜底 |
| `cloudfunctions/common/prompts/analysisPrompt.js` | 全篇术语温和化 |
| `miniprogram/pages/index/index.wxml` | 首页标签温和化 |
| `deploy.sh` | ocrImage/ocrBatch 添加 sleep |

### 后续
- 需重新 `bash deploy.sh` 部署云函数
- 需微信开发者工具上传小程序代码
