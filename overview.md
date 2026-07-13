# 云开发 -604100 错误修复概览

## 问题

微信开发者工具控制台报错：
```
登录失败: <Error: errCode: -604100 API not found | errMsg: system error: error code: -604100>
cloud sdk (build ts 1670494204239) injection skipped for sdk version 3.16.2
当前 cloudVersion: undefined
```

## 根因

`app.json` 在 v4 合规改造时丢失了 `cloudfunctionRoot` 字段。没有这个字段，微信开发者工具不知道云函数代码在哪里，导致：
1. 云 SDK 注入被跳过（`injection skipped`）
2. `wx.cloud.callFunction` 找不到 API（`-604100`）

## 修复内容

### 1. 配置修复
| 文件 | 改动 |
|------|------|
| `app.json` | 加回 `cloudfunctionRoot: ../cloudfunctions/` |
| `project.config.json` | 加 `cloudfunctionRoot` + `miniprogramRoot` |

### 2. login 云函数简化
- **之前**: `wx.login()` → get code → `callFunction('login', {code})` → `cloud.openapi.auth.code2Session({code})` → get openid
- **之后**: `callFunction('login')` → `cloud.getWXContext().OPENID` → done
- 不再需要 `wx.login` + `code` 流程
- 不再需要 `auth.code2Session` openapi 权限

### 3. app.js 登录容错
- 登录失败从 `console.error` 降级为 `console.warn`（不阻塞 app 启动）
- 新增 `ensureLogin()` 方法供其他页面按需调用
- 低版本基础库安全降级（`wx.cloud` 不存在时）

### 4. 清理
- 删除 `miniprogram/cloudfunctions/` 重复目录（9000+ 行垃圾代码）

## 测试结果
19/19 全部通过

## 你需要做的

修复后，在微信开发者工具中需要**重新上传部署云函数**：

```
1. 右键 cloudfunctions/login → 上传并部署：云端安装依赖
2. 其他云函数也依次上传部署
3. 重新编译运行
```

## Git
```
8cfd722  fix: 修复云开发 -604100 错误 ← 当前
c01eb82  fix: 微信隐私授权修复
ac20599  v4: 合规改造
```
