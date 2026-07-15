# UI 文案温和化改造交付

## 改动了什么

全小程序用户可见的"硬词"替换为更适合情侣/朋友之间使用的温和表达。**纯文案替换，零逻辑变更。**

## 具体替换表

| 原词 | 替换为 |
|------|--------|
| 证据 | 聊天记录 / 聊天内容 |
| 甲方 / 乙方 | 你 / 对方 / 我 |
| 提交 | 上传 / 发送 / 开始分析 |
| 调解策略 | 缓和建议 |
| 调解路线图 | 沟通路线图 |
| 补充证据 | 补充聊天内容 / 补充聊天记录 |
| 案例标题 | 给它起个名 |
| 提交证据 → 按钮 | 开始分析 |
| 证据提交成功！ | 聊天记录已收到！ |
| 公平裁判 | 一起评理 |
| 加入调解 | 一起看看 |
| 关键证据 | 关键内容 |

## 涉及文件（21 个）

| 文件 | 说明 |
|------|------|
| `pages/upload/upload.wxml/js/wxss` | 上传页全部文案改软 |
| `pages/report/report.wxml/js/wxss` | 报告页分节标题、补充按钮、分享文本 |
| `pages/index/index.wxml/js` | 首页模式描述、状态标签 |
| `pages/case-detail/case-detail.wxml` | 提示文案、加入邀请 |
| `pages/create-case/create-case.wxml/js` | 默认标题、表单标签、说明文案 |
| `pages/ocr-preview/ocr-preview.wxml` | 确认按钮文案 |
| `utils/format.js` | 状态标签映射 |
| `components/evidence-weights/` | "关键内容"标题、"偏向你/对方"标签 |
| `components/mediation-strategy/` | "沟通路线图"标题、"你/对方"目标标签 |
| `components/evidence-section/` | "我的聊天记录"、"查看聊天记录" |
| `components/core-verdict/` | "你/对方"分数标签 |
| `components/detailed-analysis/` | "你更有理/对方更有理"裁判结论 |
| `components/party-status/` | "我/对方"回退标签 |
| `components/invite-panel/` | "邀请对方"标题 |
| `components/case-card/` | "你已上传"状态 |
| `pages/upload/upload.wxss` | 文件注释 |

## Git
- `c8cd1c8` — `refactor(UI): 全站文案温和化改造 — 去除'证据''甲方/乙方'等硬词`

## 部署
- ⏳ 需微信开发者工具上传前端代码后生效
- 无需部署云函数（纯前端改动）
