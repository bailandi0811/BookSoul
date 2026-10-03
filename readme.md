# BookSoul（书魂）

BookSoul 是一个私人小说阅读助手。用户登录后可以上传自己的 EPUB 或 TXT 小说，为每本书获得独立的阅读进度、对话历史、原文引用和书内记忆，并可让模型通过 `prepare_email` 工具把“发到邮箱”类指令转换为邮件草稿，明确确认后发送。检索边界由服务端根据账号、书籍与阅读进度生成，客户端不能指定 owner 或 book scope。

## 环境要求

- Node.js 22，推荐 `22.19.0`；npm 10
- PostgreSQL
- OpenAI API 兼容的 Chat 与 Embedding 服务
- Milvus 或 Zilliz Cloud
- Redis（多个 API 实例共享 Agent 并发门禁时必需；单实例开发可使用本地模式）

Embedding 模型必须输出 1024 维向量。

## 本地启动

以下命令使用 Windows PowerShell。首次运行先完成[首次安装与配置](#首次安装与配置)，之后按[日常启动](#日常启动)操作。前后端分别使用一个终端，两个终端都从仓库根目录开始。

### 日常启动

启动顺序：**依赖服务 → 后端 → 前端 → 浏览器**。

#### 1. 确认依赖服务已运行

确认 `server/.env` 对应的 PostgreSQL、Milvus 或 Zilliz Cloud 可连接，Chat / Embedding 服务配置可用。沿用已有配置。

如果 `AGENT_ADMISSION_MODE=redis`，必须先启动 `REDIS_URL` 对应的 Redis。本机 Redis 已安装在 WSL Ubuntu 时，另开一个 PowerShell 终端：

```powershell
wsl -d Ubuntu
```

进入 Ubuntu 后检查 Redis：

```bash
redis-cli ping
```

本例使用本机默认 6379 端口，应返回 `PONG`。如果无法连接，运行 `sudo service redis-server start` 启动已安装的服务，再检查。其他发行版、远程 Redis 或自定义端口按实际 `REDIS_URL` 检查。

**保持这个 WSL 终端打开**，避免发行版退出后 Redis 和 Windows 本机端口转发不可用。使用 `local` 模式时可跳过 Redis 步骤；准入模式及连接失败处理见[服务端说明](server/README.md#agent-并发准入)。

#### 2. 启动后端

后端终端从仓库根目录执行：

```powershell
cd server
npm run start:dev
```

编译完成后，继续等待以下启动提示：

```text
Nest application successfully started
Server is running on http://localhost:3000
```

后端默认监听 `http://localhost:3000`，端口以 `PORT` 配置和实际启动提示为准。启动后，持久化 worker 会自动处理上传、Embedding、失败恢复和删除清理。保持后端终端运行。

#### 3. 启动前端

另开前端终端，从仓库根目录执行：

```powershell
cd client
npm run dev
```

看到 Vite 的 `Local: http://localhost:5173/` 提示后，保持前端终端运行。开发代理将 `/api` 请求转发到 `http://localhost:3000`；若后端使用其他端口，需同步核对 `client/vite.config.ts` 中的代理目标。

#### 4. 验证并打开页面

另开 PowerShell 终端，检查后端及前端代理：

```powershell
curl.exe --max-time 5 -i http://localhost:3000/api/auth/me
curl.exe --max-time 5 -i http://localhost:5173/api/auth/me
```

这两个请求未携带登录凭据，正常应迅速返回 `401 Unauthorized`，表示后端认证路由和前端代理均可响应。随后访问 [http://localhost:5173](http://localhost:5173)，登录后即可使用私人书架。

停止运行时，在前后端终端分别按 `Ctrl+C`，后端停止后再关闭 Redis 所在的 WSL 终端。日常重启无需重新复制 `.env`、安装依赖或执行数据库迁移；依赖或数据库结构升级时按对应变更说明处理。

#### 常见启动问题

| 现象 | 排查方式 |
| --- | --- |
| 持续出现 `Redis admission store connection error` | 检查 Redis 是否运行、WSL 会话是否保持打开，以及 `REDIS_URL` 的主机和端口是否可达；恢复 Redis 后重新启动后端。 |
| 已显示 `Found 0 errors`，但没有后端启动成功提示 | 检查后续数据库、Redis 或 Milvus 连接日志；编译完成后仍需等待依赖初始化。 |
| 页面停在“正在恢复会话”或显示“暂时无法恢复会话” | 先用上面的两个请求检查后端和代理；修复服务后点击“重试”或刷新。认证超时与取消规则见[客户端说明](client/README.md)。 |
| 出现 `EADDRINUSE` 或 Vite 改用了 5174 等端口 | 用下方命令查看占用进程，确认属于本项目后回到对应终端按 `Ctrl+C`，再重新启动。默认开发来源与代理按 5173 / 3000 配置。 |

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,5173 |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

### 首次安装与配置

#### 1. 准备后端

```powershell
cd server
npm ci
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
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

认证邮件与阅读笔记邮件复用 `SMTP_USER`、`SMTP_PASS` 和 `SMTP_FROM`；新注册邮箱验证及找回密码还需独立 `AUTH_CHALLENGE_SECRET` 和受信任客户端地址 `AUTH_PUBLIC_BASE_URL`。未配置时旧账号仍可登录，新邮件能力返回服务不可用。其他选项见 `server/.env.example`；迁移、真实收件、发布与安全回退见[认证验收记录](docs/auth-email-acceptance.md)。

联网资料检索也是可选能力。只需填写 `TAVILY_API_KEY` 即会启用，MCP 地址、工具白名单和超时已有安全默认值。用户必须在单次问答中主动授予 Agent 联网权限；模型只根据本次问题与必要书名决定是否调用一次 `tavily_search`，小说正文、笔记、历史消息和账号信息不会进入联网决策或搜索请求。

单实例开发默认使用 `AGENT_ADMISSION_MODE=local`。部署多个后端实例前必须改为 `redis` 并配置 `REDIS_URL`，让同一会话、每用户和系统全局并发限制在所有实例之间一致生效；Redis 不保存问题、回答或小说正文。完整参数见 `server/.env.example` 和 `server/README.md`。

生成 Prisma Client：

```powershell
npm run prisma:generate
```

确认 `DATABASE_URL` 指向为本项目准备的全新空数据库后，应用已有迁移：

```powershell
npm run prisma:migrate:deploy
```

如果数据库已有账号、书籍或其他数据，先核对目标和待应用迁移并准备备份，再按相应升级说明执行。

#### 2. 准备前端

另开一个终端，从仓库根目录执行：

```powershell
cd client
npm ci
```

安装完成后回到[日常启动](#日常启动)。开发环境同时允许 `localhost:5173` 与 `127.0.0.1:5173`；生产环境应把 `CORS_ORIGINS` 改为实际来源。

> macOS 和 Linux 用户使用对应的终端，并在 `.env` 尚不存在时用 `cp .env.example .env` 创建配置文件；保留已有 `.env`。

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
- 公共书库复用只读 `SYSTEM` 书籍，仅登录用户可使用；每人的助手、阅读进度、对话和记忆仍然私有，规则见[服务端说明](server/README.md#书籍处理生命周期)。
- Milvus 只保存过滤字段和向量；PostgreSQL 是正文与引用的事实源。
- 默认只检索阅读进度以内的章节；全书检索需要单次显式放行。
- 删除书籍会异步清理向量、源文件和数据库记录，系统示例语料不可由普通用户删除。
- 小说正文和召回记忆都按不可信数据处理，不能覆盖平台提示词与权限规则。

更完整的技术设计见 [私人阅读助手 MVP 设计](docs/superpowers/specs/2026-08-29-private-reading-assistant-mvp-design.md)。
