# BookSoul Server

NestJS 11 API，提供账号认证、私人书架、EPUB/TXT 持久化处理、版本化向量检索、按书会话、阅读进度、防剧透、原文引用和隔离记忆。

## 命令

```bash
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
npm run check
```

`npm run check` 依次执行 lint、TypeScript 检查、单元测试和生产构建。`npm run lint` 不修改文件；需要自动修复时显式执行 `npm run lint:fix`。

默认的 `npm test` 和 `npm run check` 不加载真实数据库集成测试。需要验证 Prisma 约束时，先创建独立测试数据库和测试 schema，再显式运行：

```powershell
$env:TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/booksoul_test?schema=test_prisma'
npm run test:db
```

门禁会拒绝缺失或非法的 `TEST_DATABASE_URL`，并强制数据库名以 `_test` 结尾、schema 以 `test_` 开头；测试清理也只作用于固定 fixture 账号，禁止全表清理。

## 认证与作用域

- 登录和注册返回 `{ accessToken, user }`，同时设置 `booksoul_refresh` HttpOnly Cookie。
- `POST /api/auth/refresh` 与 `POST /api/auth/logout` 从 Cookie 读取刷新令牌。
- Access Token 默认 15 分钟；过期后客户端用 Refresh Token 静默轮换，不应要求重新登录。Refresh Token 默认滚动有效 7 天，连续 7 天未使用或令牌被吊销后才需要重新登录。
- 私人书籍接口使用 `Authorization: Bearer <access-token>`。
- owner 始终来自服务端认证上下文；聊天请求只接受 `sessionId`、`message` 与单次 `spoilerOverride`。
- session 在服务端反查 assistant、book、owner、embedding version 与 spoiler ceiling。

## 书籍处理生命周期

上传只保存文件并创建持久任务。worker 依次执行解析、分节、切块、批量 Embedding、Milvus 写入和一致性核对，成功后书籍进入 `READY`。失败会保留稳定错误码并支持重试；进程重启后会回收超时租约。

删除先把书籍置为 `DELETING`，再可靠清理向量、源文件和 PostgreSQL 记录。部分失败不会误报完成，后台会继续重试。

## 配置

复制 `.env.example` 为 `.env`。启动时会拒绝缺失的 `DATABASE_URL`、少于 32 位或仍为示例值的 `JWT_ACCESS_SECRET`，以及非法的数值配置。

生产环境必须：

- 把 `CORS_ORIGINS` 设置为真实前端来源，可用逗号分隔多个来源；
- 使用独立随机的 JWT 密钥；
- 通过密钥管理服务注入数据库、模型和 Milvus 凭据；
- 使用私有、持久化的 `BOOK_UPLOAD_DIR`；
- 不记录密码、Token、Cookie、正文、完整访客标识或私有路径。

### 可选联网资料检索

填写 `TAVILY_API_KEY` 即会启用 Tavily 远程 MCP。`TAVILY_MCP_URL`、`MCP_ALLOWED_TOOL_NAMES` 和 `MCP_TOOL_TIMEOUT_MS` 已有默认值；当前只允许只读的 `tavily_search`，不开放 extract、crawl、map 或写工具。Key 只能通过密钥管理或 `.env` 注入，不要放入 URL、日志或仓库。

联网检索必须由用户在当次请求显式设置 `externalResearch: true`。该字段只授予本轮权限：模型先在只含当前问题与必要书名的隔离上下文中自行决定是否调用一次 `tavily_search`，服务端再验证工具名与参数并执行 MCP。小说正文、会话历史、用户记忆、owner 和 book id 不进入工具决策或搜索请求。返回内容按不可信资料清洗与限长，通过 `ToolMessage` 交回模型，并与书内章节引用分开返回。

### 可选邮件发送

如需在聊天回答上使用“发送到邮箱”，配置 `SMTP_USER`、`SMTP_PASS` 和 `SMTP_FROM`；非 QQ 邮箱还需设置 `SMTP_HOST`、`SMTP_PORT` 与 `SMTP_SECURE`。密码应使用邮件服务商的 SMTP 授权码，不要提交到仓库。

聊天模型仅在当前用户消息明确要求发送邮件时获得 `prepare_email` 工具。模型负责生成结构化的收件人、主题和纯文本正文，工具只通过 SSE 返回可编辑草稿；小说正文、外部资料、记忆和历史消息不能授予工具权限，显式收件人在进入检索前会被脱敏。

`POST /api/tools/email` 只接受 JWT 登录用户，要求请求体携带 `confirmed: true`，并限制为每来源每分钟 5 次。无论草稿来自回复邮件按钮还是模型工具，只有用户点击“确认并发送”后才调用该接口；模型不能直接执行 SMTP 投递。

## 迁移

`npm run migrate:file-data` 可幂等复制旧 JSON 数据，不删除源文件。

`npm run migrate:private-reader -- ../天龙八部.epub` 可创建稳定的只读系统示例书。正文随后会发送给当前 Embedding 服务并写入当前 Milvus 目标，因此执行前必须确认文件处理权限和外部数据目的地。书籍 READY 后执行 `npm run migrate:private-reader:backfill`，把可识别的注册用户旧会话和小说内容类记忆绑定到各自的系统书助手；账号偏好与用户事实仍保持全局。

## 端到端验收

服务运行且 PostgreSQL、模型与 Milvus 可用时：

```bash
npm run test:e2e:reader
```

脚本覆盖上传、READY、目录、阅读进度、助手设置、引用、防剧透、按书记忆、历史和删除清理，并自动删除临时用户。
