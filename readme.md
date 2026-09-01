# BookSoul（书魂）

BookSoul 是一个私人小说阅读助手。用户登录后可以上传自己的 EPUB 或 TXT 小说，为每本书获得独立的阅读进度、对话历史、原文引用和书内记忆，并可让模型通过 `prepare_email` 工具把“发到邮箱”类指令转换为邮件草稿，明确确认后发送。检索边界由服务端根据账号、书籍与阅读进度生成，客户端不能指定 owner 或 book scope。

## 环境要求

- Node.js 22，推荐 `22.19.0`
- PostgreSQL
- OpenAI API 兼容的 Chat 与 Embedding 服务
- Milvus 或 Zilliz Cloud
- Redis（多个 API 实例共享 Agent 并发门禁时必需；单实例开发可使用本地模式）

Embedding 模型必须输出 1024 维向量。

## 本地启动

### 1. 准备后端

```powershell
cd server
npm ci
Copy-Item .env.example .env
```

生成 JWT 密钥：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

在 `server/.env` 中至少填写：

```dotenv
DATABASE_URL=postgresql://booksoul:booksoul@127.0.0.1:5432/booksoul?schema=public
JWT_ACCESS_SECRET=粘贴刚才生成的随机密钥
OPENAI_API_KEY=你的API密钥
OPENAI_BASE_URL=你的API地址
MODEL_NAME=你的对话模型名称
EMBEDDING_MODEL_NAME=你的向量模型名称
MILVUS_ADDRESS=localhost:19530
MILVUS_TOKEN=root:Milvus
```

邮件发送是可选能力。如需使用，另行填写 `SMTP_USER`、`SMTP_PASS` 和 `SMTP_FROM`；其他 SMTP 选项见 `server/.env.example`。

联网资料检索也是可选能力。只需填写 `TAVILY_API_KEY` 即会启用，MCP 地址、工具白名单和超时已有安全默认值。用户必须在单次问答中主动授予 Agent 联网权限；模型只根据本次问题与必要书名决定是否调用一次 `tavily_search`，小说正文、笔记、历史消息和账号信息不会进入联网决策或搜索请求。

单实例开发默认使用 `AGENT_ADMISSION_MODE=local`。部署多个后端实例前必须改为 `redis` 并配置 `REDIS_URL`，让同一会话、每用户和系统全局并发限制在所有实例之间一致生效；Redis 不保存问题、回答或小说正文。完整参数见 `server/.env.example` 和 `server/README.md`。

初始化并启动：

```powershell
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
```

后端地址为 `http://localhost:3000`。启动后，持久化 worker 会自动处理上传、Embedding、失败恢复和删除清理。

### 2. 准备前端

另开一个终端：

```powershell
cd client
npm ci
npm run dev
```

访问 `http://localhost:5173`，注册或登录后即可上传小说。开发环境同时允许 `localhost:5173` 与 `127.0.0.1:5173`；生产环境应把 `CORS_ORIGINS` 改为实际来源。

> macOS 和 Linux 用户把 `Copy-Item .env.example .env` 换成 `cp .env.example .env` 即可。

## 数据迁移

旧版 JSON 数据迁移：

```powershell
cd server
npm run migrate:file-data
```

该命令只复制数据，可以安全重跑，不会删除原文件。

仓库内的《天龙八部》可以按需迁移为只读系统示例书：

```powershell
cd server
npm run migrate:private-reader -- ../天龙八部.epub
```

该命令会创建稳定的系统书记录，后台随后把正文发送给已配置的 Embedding 服务并将向量写入 Milvus 或 Zilliz。只有在你有权处理该文件并接受这个外部数据流时才应执行。系统书进入 `READY` 后回填可识别的旧账号会话和小说内容类记忆；账号偏好与用户事实继续保持全局：

```powershell
npm run migrate:private-reader:backfill
```

未注册的旧访客会话无法满足外键身份约束，会被保留并计入跳过数量。

## 质量检查

```powershell
# 后端
cd server
npm run check

# 前端
cd ../client
npm run check
```

后端已运行且外部依赖可用时，可以执行完整私人阅读闭环：

```powershell
cd server
npm run test:e2e:reader
```

该脚本会创建临时账号和小说，验证上传、索引、进度、防剧透、引用、记忆、历史与可靠删除，并在结束时清理测试数据。

## 隐私与边界

- 私人上传按用户和书籍双重隔离，源文件不会通过 API 返回。
- Milvus 只保存过滤字段和向量；PostgreSQL 是正文与引用的事实源。
- 默认只检索阅读进度以内的章节；全书检索需要单次显式放行。
- 删除书籍会异步清理向量、源文件和数据库记录，系统示例语料不可由普通用户删除。
- 小说正文和召回记忆都按不可信数据处理，不能覆盖平台提示词与权限规则。

更完整的技术设计见 [私人阅读助手 MVP 设计](docs/superpowers/specs/2026-08-29-private-reading-assistant-mvp-design.md)。
