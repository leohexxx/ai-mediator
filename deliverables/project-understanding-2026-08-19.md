# 啷个对 / AI Mediator 项目理解基线

日期：2026-08-19

## 我已确认的主生产链路

小程序生产主链路是 `miniprogram/` + 私有 CloudRun `ai-mediator-backend/cloudrun/`，不是旧云函数链路：

1. 首页创建单人/双人案件。
2. 上传页保存草稿；相册图片先上传到 `evidence/<caseId>/` 云存储。
3. 图片识别通过 `POST /api/upload/ocr-jobs` 创建异步任务，OCR Worker 后台处理，千问视觉失败再回退腾讯 OCR；小程序轮询并支持离开页面后恢复。
4. OCR 校对完成后，`POST /api/evidence/batches` 追加证据批次并递增 revision。
5. `POST /api/analyze/start` 事务获取案件级分析锁并固定证据版本；Analysis Worker 后台生成报告。
6. 报告页通过案例详情和分析进度接口恢复/展示结果；追问走 CloudRun chat API。

旧 `cloudfunctions/` 仍是兼容/回滚链路，包含旧 `evidence` 覆盖写、同步 OCR 和旧状态语义，不能在排查 CloudRun 生产问题时混用。

## 不可破坏的边界

- 继续使用既有 AppID 和既有 CloudBase 环境。
- CloudRun 保持私有 `MINIAPP` 访问。
- 业务集合保持 server-only，所有写入必须经过后端鉴权和案件参与方校验。
- 证据必须追加、保留 revision 和历史报告；分析期间锁证据。
- OCR 异步任务必须保留幂等、租约、重试、去重、恢复和腾讯回退。
- 不把用户聊天内容加入跨案件知识库；画像只能影响沟通建议，不能改变事实/责任/置信度。
- 当前工作树很脏，不能 `git reset --hard`、`git clean`、`git add .` 或全量覆盖。

## 当前已核对的高优先级问题线索

1. **双人建案参数缺失**：`miniprogram/pages/create-case/create-case.js` 调用 `caseService.createCase()` 时没有传 `mode: 'dual'`；服务层默认 `single`。首页切到双人后进入该页面，实际可能创建成单人案件，导致邀请码/双人链路失效。
2. **旧状态与生产状态混杂**：小程序仍有 `dual_a_submitted/dual_b_submitted` 的旧兼容展示，但当前 CloudRun 的分析完成状态由 `analysisPipeline.js` 统一写成单人 `single_completed` 或双人 `completed`。后续改动应先以 CloudRun 实际状态为准，不能贸然恢复旧云函数辩论状态机。
3. **双人完成态展示需回归**：首页、案例详情和部分 case-card WXML 对 `completed` 判断较多；应使用真实 CloudRun 双人案例做一次“双方证据→分析完成→报告入口”回归。
4. **邀请码二维码事件未闭环**：`invite-panel` 会触发 `generateqrcode`，但案例详情页没有绑定对应事件；`onInvitePanelShare` 也只是空实现。是否修复要先确定产品仍需要二维码/原生分享哪一种入口。
5. **报告页按钮字段错配**：`report.wxml` 使用 `reanalyzing`，`report.js` 实际维护 `personalitySaving`，保存沟通偏好时加载态可能不更新。
6. **视频仍走同步兼容 OCR**：上传页视频帧调用 `/api/upload/ocr-batch`，与截图异步 OCR 不是同一链路；需要单独做超时和帧数回归。当前代码实际 `maxFrames = 15`，与项目记忆中要求的上限 12 不一致，应先确认产品基线再改。
7. **工作树已有大量用户修改**：只读检查发现大量已修改/未跟踪/删除文件，且 `git diff --check` 已有既存 trailing whitespace；这些不是本轮理解任务产生的改动，后续必须按明确文件操作。

## 后续协作顺序

先用真实体验版验证 P0：0.3.9 图片异步 OCR（9+2、退出恢复、失败重试）和双人主链路；拿到具体错误码、jobId、analysisId 后再改代码。每次改动只针对明确生产入口，先补测试，再做定向回归，最后检查空白错误和凭据扫描。
