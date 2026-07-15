# 综合修复交付报告 — 2026-07-15

修复了用户报告的 5 个问题，共修改 8 个文件（+383/-96 行）。

## 问题修复清单

| # | 问题 | 根因 | 修复方式 |
|---|------|------|---------|
| 1 | 图片只能传9张 | wx.chooseMedia 上限 | 添加"继续添加"按钮，分批追加图片和OCR结果 |
| 2 | 上传页UI不合理 | 截图放在第二位，导出.txt放第一位 | 截图置顶+推荐标签，纵向排列，文案精简 |
| 3 | 双人模式乙方无法上传 | 无加入入口，getCaseDetail拒绝非参与者 | 新增加入按钮+onJoinCase流程，inviteCode处理 |
| 4 | 手机端OCR经常失败 | OCR.space免费API中文识别率低 | 新增腾讯云OCR(cloud.openapi)为首选，OCR.space降级 |
| 5 | 首次分析卡住需重试 | 竞态：未等analysisId就跳转报告页 | 等待analyzeCase返回后再跳转，传递analysisId |

## 修改文件

- `miniprogram/pages/upload/upload.js` — 分批上传+等待分析结果后跳转
- `miniprogram/pages/upload/upload.wxml` — UI重排+继续添加按钮
- `miniprogram/pages/upload/upload.wxss` — 纵向排列+推荐样式
- `miniprogram/pages/report/report.js` — 接收analysisId参数+轮询兜底
- `miniprogram/pages/case-detail/case-detail.js` — 加入案例逻辑
- `miniprogram/pages/case-detail/case-detail.wxml` — 加入提示UI
- `miniprogram/pages/case-detail/case-detail.wxss` — 加入提示样式
- `cloudfunctions/ocrImage/index.js` — 腾讯云OCR+OCR.space双方案

## 部署

- ✅ 云函数 `ocrImage` 已部署到 CloudBase
- ⏳ 前端文件需微信开发者工具上传后生效

## 测试

- 19/19 集成测试通过
- 语法检查全部通过
