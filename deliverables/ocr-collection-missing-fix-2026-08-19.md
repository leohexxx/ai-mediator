# OCR 集合缺失修复记录

日期：2026-08-19

## 真机错误根因

CloudRun 返回：

```text
DATABASE_COLLECTION_NOT_EXIST
[ResourceNotFound] Db or Table not exist: ocr_jobs
```

这意味着截图已经可能上传到 Cloud Storage，但异步 OCR 任务没有写入 `ocr_jobs` 集合，因此此前“任务记录已经保留”的提示不准确；用户返回后也无法找到任务。

## 已完成修复

### 服务端

- 新增数据库集合初始化脚本：

```bash
npm run db:ensure-collections --prefix ai-mediator-backend/cloudrun
```

- 脚本会检查或创建 `ocr_jobs`。
- 生产环境执行脚本前必须注入 CloudBase 服务端凭据。
- 集合创建后，再应用 `database-rules/server-only.json`。
- 数据库错误会转换为：
  - HTTP 503
  - `OCR_COLLECTION_NOT_READY`
  - “图片识别服务尚未完成初始化，请稍后重试或联系管理员处理”

### 小程序

- 图片上传后，如果任务创建失败，会保留已上传的 `fileId`。
- 草稿中保存 `pendingOcrFileIds` 和 `ocrCreatePending`。
- 上传页显示“继续识别这批截图”。
- 修复 CloudBase 集合后，用户点击该按钮即可继续创建任务，不需要重新选择图片。
- 如果任务已经成功创建，则继续使用 `pendingOcrJobId` 恢复轮询。

## 测试结果

- 小程序定向测试：19/19 通过。
- CloudRun 测试：38/38 通过。
- 集合初始化脚本本地模式检查：通过。
- 修改文件 JavaScript 语法检查：通过。

## 必须执行的云端操作

1. 在目标 CloudBase 环境 `cloudbase-d4g5p82875fe1a5ce` 准备服务端凭据。
2. 执行：

```bash
npm run db:ensure-collections --prefix ai-mediator-backend/cloudrun
```

3. 在 CloudBase 控制台确认集合名严格为：

```text
ocr_jobs
```

4. 应用 `database-rules/server-only.json`，禁止小程序直接读写。
5. 部署包含本轮改动的 CloudRun 版本。
6. 上传并设为体验版的小程序新版本。
7. 回到原上传页点击“继续识别这批截图”。

不要直接删除云存储中已上传的图片，也不要把 OCR 改回同步调用。
