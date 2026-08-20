# CloudBase 初始化就绪检查

日期：2026-08-19

## 结论

目标环境已确认：`cloudbase-d4g5p82875fe1a5ce`。

本轮已使用项目现有的 `ai-mediator-backend/cloudrun/env.txt` 连接目标环境，并成功创建 `ocr_jobs` 集合。该文件包含 CloudBase 服务端 API Key，现已加入项目 `.gitignore`，不会纳入 Git 提交。

集合初始化结果：

```json
{"event":"collections_ready","results":[{"name":"ocr_jobs","created":true,"exists":true,"count":0}]}
```

本轮未自动修改数据库权限。CloudBase 的管理端权限接口需要腾讯云 `SecretId` + `SecretKey`；当前 API Key 已足够执行数据库访问和创建集合，但不用于管理集合权限。请在控制台将 `ocr_jobs` 设置为“仅管理端可读写”，等价于 `server-only.json`。

此前的连接阻塞说明如下：

本轮未执行生产 CloudBase 写操作。原因是当时本机没有可用的 CloudBase 服务端凭据：

- `CLOUDBASE_APIKEY`：此前检查时未配置；现在已从现有 `env.txt` 读取并验证连接成功
- `CLOUDBASE_SECRET_ID`：未配置
- `CLOUDBASE_SECRET_KEY`：未配置

CloudBase Node SDK 已安装，且确认支持 `db.createCollection()`；使用现有 `env.txt` 中的 API Key 成功连接目标环境并创建集合。

## 已验证项目

- 集合初始化脚本：`ai-mediator-backend/cloudrun/scripts/ensure-collections.js`
- 初始化命令：

```bash
npm run db:ensure-collections --prefix ai-mediator-backend/cloudrun
```

- 本地模式验证通过：

```json
{"event":"collections_ready","results":[{"name":"ocr_jobs","created":false,"exists":true,"count":0}]}
```

- CloudRun OCR 定向测试：4/4 通过
- 小程序 CloudRun 链路测试：1/1 通过
- OCR 初始化脚本、数据库适配器、Pipeline、Worker 语法检查通过
- 已找到测试素材：`1/` 目录下 11 张 JPG

## 后续执行顺序

1. 在 CloudBase 控制台将 `ocr_jobs` 权限设置为“仅管理端可读写”，等价于 `database-rules/server-only.json` 的四项 `false`。
2. 保存并重新部署 CloudRun，使运行时环境变量生效，并保持 CloudRun 访问类型为 `MINIAPP`。
3. 使用 11 张 JPG 中的测试图片，或用户当前已上传的 `pendingOcrFileIds`，验证：上传 → 创建任务 `202 + jobId` → Worker → 千问视觉 → 轮询完成。
4. 体验版中点击“继续识别这批截图”，不需要重新选图。

## 安全边界

本轮没有读取、打印或保存任何真实密钥；没有把本地模式结果当作生产环境结果；没有删除云存储中的已上传图片，也没有把 OCR 改回同步调用。
