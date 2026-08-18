# CloudBase 数据库安全规则

小程序只需要直接读取 `messages` 集合以接收流式追问，其余业务集合均通过已鉴权的云函数或 CloudRun 访问。

在 CloudBase 控制台的集合权限管理中应用：

- `messages`：使用 `messages.json`。查询必须同时带 `_id` 与当前用户的 `userId`；客户端不可写。
- `cases`、`analyses`、`evidence`、`invitations`、`users`、`share_cards`：使用 `server-only.json`。

云函数以服务端身份运行，不受前端数据库安全规则限制。规则部署后，用非案件参与者账号验证无法读取任何业务集合，并验证追问流仍可读取本人 `messages` 文档。
