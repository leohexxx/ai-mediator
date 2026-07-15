# 全链路测试与优化交付总结

## TL;DR
找到并修复了"用户说结果还是一样的"的根本原因——腾讯云 OCR 权限未生效 + 帧率分布不均匀 bug + deploy.sh 配置覆盖 bug。

---

## 测试发现的问题

### 🔴 问题1: 腾讯云 OCR 权限实际未生效（最重要）
- **根因**: 之前用 `updateFunctionCode` 部署云函数，这个 API **不传 permissions.openapi**
- **后果**: config.json 的权限声明是摆设，所有 OCR 调用都降级到 OCR.space（每帧 5-15s）
- **15帧情况**: 4 批并发 × 每批最慢 15s = ~60s+ → 用户感知"几分钟未识别"
- **修复**: 用 `updateFunctionConfig` 单独设置 permissions.openapi
  ```bash
  npx mcporter call cloudbase manageFunctions --args "...updateFunctionConfig...permissions..."
  ```
- ✅ `ocrImage` 和 `ocrBatch` 均已配置

### 🔴 问题2: deploy.sh 有空配置调用覆盖 bug
- 第 37 行: `updateFunctionConfig` 不带任何参数 → **覆盖清空**前面设好的 permissions
- 修复: 已删除该行 ✅

### 🔴 问题3: 帧率分布不均匀
- 原算法: `(i+0.5)*interval` 从 0 开始取 → 长视频只覆盖前 73s
- 修复: `step = duration/totalFrames` 均匀分布全覆盖
- 2min: 覆盖 44s→116s (+164%)
- 10min: 覆盖 73s→580s (+695%)

---

## 测试结果

| 测试项 | 结果 | 耗时 |
|--------|------|------|
| ocrImage 云函数调用 | ✅ 正常响应 | 4ms |
| analyzeCase 云函数调用 | ✅ 正常响应 | 8ms |
| 帧率策略模拟(15s/30s/1m/2m/3m/5m/10m) | ✅ 全覆盖 | - |
| 图片 MAX=1600 base64 大小估算 | ✅ 最大 1MB，安全不超限 | - |

## 用户下一步
1. **微信开发者工具 → 上传小程序代码**（upload.js 帧率均匀分布需要）
2. **手机端重新测试**：视频上传速度应有明显改善（腾讯云 OCR 不再降级到 OCR.space）
3. 以后跑 `bash deploy.sh` 会自动设置 permissions.openapi
