# BookSoul Server

NestJS 11 API，提供认证、访客认领、聊天 SSE、RAG、历史、画像、记忆、受控 MCP 和显式确认邮件接口。

## 命令

```bash
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
npm run check
```

`npm run check` 依次执行 lint、TypeScript 检查、60 项单元测试和生产构建。`npm run lint` 不修改文件；需要自动修复时显式执行 `npm run lint:fix`。

## 认证约定

- 登录和注册返回 `{ accessToken, user }`，同时设置 `booksoul_refresh` HttpOnly Cookie。
- `POST /api/auth/refresh` 与 `POST /api/auth/logout` 从 Cookie 读取刷新令牌，请求体不接受该令牌。
- 账号请求使用 `Authorization: Bearer <access-token>`。
- 访客业务请求使用 `X-Guest-User-Id: guest_<uuid>`。
- 带有无效 Bearer Token 的请求不会降级为访客。

## 配置

复制 `.env.example` 为 `.env`。启动时会拒绝缺失的 `DATABASE_URL`、少于 32 位或仍为示例值的 `JWT_ACCESS_SECRET`，以及非法的刷新令牌有效期。

生产环境必须：

- 将 `CORS_ORIGINS` 设置为实际前端来源，可用逗号分隔多个来源；
- 使用独立且随机的 JWT 密钥；
- 通过密钥管理服务注入数据库、模型、Milvus 和 SMTP 凭据；
- 不记录密码、Token、Cookie、完整 Guest ID 或私有数据路径。

## 工具策略

MCP 默认不向模型暴露任何能力。地图服务必须同时配置 `AMAP_API_KEY` 和 `MCP_ALLOWED_TOOL_NAMES`。本服务不会启动文件系统或任意网络抓取 MCP。

邮件不是模型工具。`POST /api/tools/email` 要求有效 Access Token、合法 DTO 和 `confirmed: true`，只发送纯文本并受全局限流保护。

## 文件数据迁移准备

Prisma schema 已包含 `ChatSessionRecord`、`UserProfileRecord` 和 `MemoryRecord`。应用数据库迁移后，执行 `npm run migrate:file-data` 可幂等复制现有文件数据；该命令不会删除源文件。当前运行时仍读取文件，生产切换前需要先完成备份、记录数核对和抽样验证。
