# BookSoul（书魂）

BookSoul 是一套面向《天龙八部》的沉浸式角色对话应用。系统使用 NestJS、React、LangChain、PostgreSQL 和 Milvus，按问题类型在直接回答与小说语义检索之间路由，并通过 SSE 流式输出回答、检索引用和记忆更新。

## 当前能力

- 乔峰、段誉、王语嫣及通用助手四种对话角色
- Agentic RAG：意图分类、查询改写、检索、结果评估和生成
- 可中断的 SSE 流式响应，带请求级竞态隔离
- 会话历史摘要及按身份隔离的文件持久化
- 用户画像、可编辑记忆和 Milvus 长期记忆检索
- PostgreSQL 账号体系、Refresh Token 轮换和访客数据认领
- MCP 默认关闭；仅加载配置了服务且出现在精确白名单中的远程工具
- 邮件只允许登录用户通过明确确认的 HTTP 接口发送，模型不能自主发送

## 安全边界

- Refresh Token 只存在于 `HttpOnly`、`SameSite=Lax` Cookie 中，不返回给前端 JavaScript。
- Access Token 短期有效；前端并发遇到 401 时只执行一次刷新并重放请求。
- Guest ID 必须是 `guest_<uuid>`；共享的旧 `anonymous` 身份已禁用。
- 历史和记忆归属只采用服务端认证上下文，不信任请求中的 `userId`。
- 服务端启用 Helmet、CORS 来源白名单、DTO 白名单校验和全局限流。
- 不再启动本地文件系统 MCP、任意 fetch MCP 或运行时 `npx -y` 子进程。

## 环境要求

- Node.js 22.19.x（仓库提供 `.nvmrc`）
- npm 10.9.x
- PostgreSQL
- Milvus
- OpenAI 兼容的 Chat 与 Embedding API

## 本地启动

```bash
cd server
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
```

另开终端：

```bash
cd client
npm install
npm run dev
```

前端默认运行于 `http://localhost:5173`，后端默认运行于 `http://localhost:3000`。开发代理由 Vite 配置处理。

## 必要配置

以 [server/.env.example](server/.env.example) 为准，至少设置：

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/booksoul?schema=public
JWT_ACCESS_SECRET=至少32位且仅用于本项目的随机值
CORS_ORIGINS=http://localhost:5173
OPENAI_API_KEY=
OPENAI_BASE_URL=
MILVUS_ADDRESS=localhost:19530
MILVUS_TOKEN=
```

地图 MCP 是可选能力。即便设置了 `AMAP_API_KEY`，仍需在 `MCP_ALLOWED_TOOL_NAMES` 中填写从该服务返回的精确工具名，否则工具保持关闭。

SMTP 也是可选能力。配置完成后，登录用户可调用 `POST /api/tools/email`，请求必须包含 `confirmed: true`，且只接受纯文本正文。

## 导入电子书

```bash
cd server
npm run ingest -- ../天龙八部.epub
```

脚本使用项目内的 `epub2` 读取章节，切分文本、生成向量并写入 Milvus。

## 质量门禁

```bash
cd client
npm run check

cd ../server
npm run check
```

两个 `check` 均执行只读 lint、类型检查、测试和生产构建。GitHub Actions 会对前后端分别执行同样的门禁。

## 数据说明

- 账号和 Refresh Token 哈希存储在 PostgreSQL。
- 小说与长期记忆向量存储在 Milvus。
- 会话历史、画像和记忆正文当前仍保存在 `server/chat_histories` 与 `server/memories`，使用按身份隔离和原子写入；生产横向扩容前应迁移到共享数据库或对象存储。
- Milvus 不可用时，普通文件记忆仍可使用，语义搜索会退化为文本搜索。

仓库已包含对应的 PostgreSQL 表和只复制、不删除源文件的幂等迁移命令。完成数据库备份并应用迁移后，可执行：

```bash
cd server
npm run prisma:migrate:deploy
npm run migrate:file-data
```

核对数据库记录数与抽样内容后，再安排生产读写切换。当前版本有意保留文件为运行时数据源，避免在未验证真实数据和备份的情况下直接破坏性切换。
