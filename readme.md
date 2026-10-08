# BookSoul（书魂）

线上地址：https://booksoul.fun/

私人小说书房。登录后上传 EPUB 或 TXT，在自己的书库里阅读和续读；每本书还有独立的助手、原文引用和书内记忆。检索范围由服务端按账号、书籍和阅读进度确定。

[功能](#功能) · [亮点](#亮点) · [难点](#难点) · [技术栈](#技术栈) · [环境要求](#环境要求) · [快速开始](#快速开始) · [项目结构](#项目结构) · [开发](#开发) · [测试](#测试) · [文档](#文档)

## 功能

| 能力 | 说明 |
| --- | --- |
| 书库 | 上传 EPUB / TXT，查看解析与索引状态、阅读进度，从封面进入本书空间 |
| 正文阅读 | 分段加载正文，附带目录、排版和独立续读位置。保存到更后的章节时，已读进度和助手讨论范围一起抬到该章；回看和预览不会扩大范围 |
| 单书助手 | 按书保留会话、引用和记忆。支持快速与深度回答；“发到邮箱”只生成草稿，确认后才发送 |
| 防剧透 | 默认只检索已读章节。全书检索需要单次显式放行 |
| 书友客厅 | 显式加入的公共交流页。消息经原生 WebSocket 收发，历史和撤回走 REST；私人书籍、助手对话和记忆留在书房内 |
| 心绪塔罗 | 登录后从顶栏进入的独立页面。牌局和解读不写入单书聊天、阅读记忆或数据库 |
| 账号与外观 | 邮箱验证、找回密码、亮暗主题，以及书房背景 |

生产容器部署见 [Docker 部署手册](docs/deployment/docker.md)，验证状态见 [部署验收记录](docs/deployment/docker-acceptance.md)。

## 亮点

- **BM25 与向量混合检索。** Milvus 按当前用户、书籍、索引版本和已读上限召回语义片段；BM25 只对 PostgreSQL 里同一范围的章节块计分。中文按重叠双字切分，两路用等权 RRF 融合，词法一路保留原文里的专名和措辞。
- **按书记忆。** 普通聊天不会自动入库。明确的个人事实、偏好，或用户说“请记住”，才通过记忆门。小说内容留在当前书，账号偏好可以跨书使用；相同内容合并进已有记录。
- **Jev 负责选阵。** 抽牌前用一次 Choice，在单张是非、时间之流和圣三角之间确定牌阵。牌位定义由服务端固定，解读模型只收到已经锁定的牌阵。
- **OSS 直传。** 浏览器把头像和壁纸直接传到对象存储。服务端核对归属、真实格式和像素后，收成私有 WebP，写入正式对象才更新资料。读取使用短时签名链接。
- **双令牌登录。** Access Token 留在内存，Refresh Token 以 HttpOnly Cookie 轮换，哈希落在数据库。新注册先验证 6 位邮箱验证码；找回密码使用一次性链接，成功后旧登录凭证在后续请求失效。
- **Skill 按角色绑定。** 塔罗选阵和解读各自绑定固定 skill，只从服务端入口加载。新注册的 skill 默认不授权，单书助手接触不到这些规则。
- **WebSocket 书友客厅。** 登录并显式加入后，用原生 WebSocket 在现有服务端口收发、确认和查看在线人数。历史、已读和撤回走 REST。消息写入 PostgreSQL，断线后按事件序号补齐。

## 难点

- **BM25 的统计口径就是防剧透边界。** 文档频率和平均长度只从当前可见块计算，未读章节不进入语料。可见块有数量、体积和时间上限，超限时整次检索失败，并保持这份统计是完整可见范围上的结果。向量或词法任一路出错，本次检索整次失败。
- **记忆要同时管内容和作用域。** 门控区分“关于这本书的事实”和“这个人的偏好”。推断出的内容默认停在门外；密码、令牌一类内容不自动保存。召回时带上当前用户和当前书，只有全局偏好可以进入这本书的上下文。
- **Jev 看到的是问题，不是牌面。** 分类请求只带当前问题和固定牌阵选项，用户原文不能改写选阵策略。未配置密钥、超时或返回无效时改为用户自选，并跳过自动重试。同一牌阵定义要同时约束前端牌位、揭晓顺序和解读提示。
- **直传之后仍要由服务端验收。** 浏览器上传不携带账号凭据。确认阶段重新解码图片，拒绝伪装扩展名、动图和超限尺寸，并去掉元数据。资料版本冲突和重复确认保持已生效的头像，避免旧图被写回去。
- **登录凭证要能轮换，也要能作废。** 刷新令牌哈希入库；多个标签页串行轮换，避免同一次刷新被当成重放。验证码以 HMAC 保存，重发后旧码失效。改密递增账号版本，使此前签发的 Access Token 和 Refresh Token 在下一次请求失效。
- **Skill 的授权停在加载之前。** 角色由固定入口决定，请求里的 Agent 或 Skill 标识不会改实际加载的规则。未绑定的 skill 在读取内容前拒绝，规则正文不进入其他运行的上下文。这是服务端代码里的授权表和源码边界检查，进程级沙箱另计。
- **聊天室要能断线再续。** 握手使用一次性短时票据，地址里不放登录凭证。同一条消息靠客户端幂等键只落库一次。进程内广播负责当场通知，重启和重连靠数据库里的事件序号补齐；当前实时广播停在单个 API 实例内。

## 技术栈

| 层级 | 选型 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、Zustand、Tailwind CSS |
| 后端 | NestJS 11、TypeScript、Prisma、LangChain / LangGraph |
| 数据 | PostgreSQL、私有文件存储、Milvus 或 Zilliz Cloud |
| 模型 | OpenAI API 兼容的对话与 Embedding 服务 |

Embedding 模型必须输出 1024 维向量。

## 环境要求

- Node.js 22，推荐 `22.19.0`；npm 10
- PostgreSQL
- OpenAI API 兼容的 Chat 与 Embedding 服务
- Milvus 或 Zilliz Cloud
- Redis：多个 API 实例共享 Agent 并发门禁时必需。单实例开发可使用本地模式

## 快速开始

以下命令使用 Windows PowerShell，两个终端都从仓库根目录开始。macOS 和 Linux 使用对应终端；`.env` 尚不存在时用 `cp .env.example .env` 创建，已有文件保持原样。

### 1. 安装依赖

```powershell
cd server
npm ci
cd ../client
npm ci
```

### 2. 配置后端

```powershell
cd server
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

把生成的随机串写入 `JWT_ACCESS_SECRET`，并在 `server/.env` 中至少填写：

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

其余选项见 `server/.env.example`。可选能力：

| 能力 | 需要的配置 |
| --- | --- |
| 注册验证、找回密码、阅读笔记邮件 | `SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`；新注册和找回密码还需 `AUTH_CHALLENGE_SECRET`、`AUTH_PUBLIC_BASE_URL` |
| 联网资料检索 | `TAVILY_API_KEY`。须在单次问答中主动授权；正文、笔记、历史和账号信息不会进入搜索请求 |
| 多实例并发门禁 | `AGENT_ADMISSION_MODE=redis` 与 `REDIS_URL`。单实例开发保持 `local` |
| 头像与个人壁纸 | 成组填写 OSS 配置。未配置时仍可修改名称和系统壁纸 |

邮件、联网检索、Redis 和资料图片的边界见 [服务端说明](server/README.md)。

### 3. 初始化数据库

确认 `DATABASE_URL` 指向为本项目准备的空库后执行：

```powershell
cd server
npm run prisma:generate
npm run prisma:migrate:deploy
```

库里已有账号或书籍时，先核对目标和待应用迁移并准备备份，再按对应升级说明执行。新增阅读位置、书友客厅等迁移也要单独核对数据库目标，不能把 `prisma migrate deploy` 当成只执行某一项迁移的命令。详见 [服务端说明](server/README.md)。

### 4. 启动

启动顺序：依赖服务 → 后端 → 前端。

确认 PostgreSQL、Milvus 或 Zilliz，以及 Chat / Embedding 配置可连接。`AGENT_ADMISSION_MODE=redis` 时先启动 `REDIS_URL` 对应的 Redis；本机 WSL Redis 的检查方式见 [服务端说明](server/README.md#agent-并发准入)。

```powershell
# 终端 1
cd server
npm run start:dev
```

看到 `Nest application successfully started` 和 `Server is running on http://localhost:3000` 后，保持该终端运行。端口以 `PORT` 和实际提示为准。

```powershell
# 终端 2
cd client
npm run dev
```

看到 `Local: http://localhost:5173/` 后保持该终端运行。开发代理把 `/api` 转发到 `http://localhost:3000`；后端改端口时，同步核对 `client/vite.config.ts`。

### 5. 打开书房

```powershell
curl.exe --max-time 5 -i http://localhost:3000/api/auth/me
curl.exe --max-time 5 -i http://localhost:5173/api/auth/me
```

未携带登录凭据时，这两个请求应返回 `401 Unauthorized`。然后打开 [http://localhost:5173](http://localhost:5173)，登录后进入书房。

在前后端终端分别按 `Ctrl+C` 停止。日常重启不必重新复制 `.env`、安装依赖或执行迁移。

## 项目结构

```text
client/     书房界面：书库、本书空间、阅读器、单书助手、账号与外观
server/     API、认证、索引 worker、检索、助手与记忆
docs/       产品设计、部署说明与验收记录
```

前后端各自的脚本、接口和模块说明见 [client/README.md](client/README.md) 与 [server/README.md](server/README.md)。

## 开发

| 现象 | 排查 |
| --- | --- |
| `Redis admission store connection error` | 检查 Redis、WSL 会话和 `REDIS_URL`，恢复后重启后端 |
| 编译已通过，但没有启动成功提示 | 继续查看数据库、Redis 或 Milvus 连接日志 |
| 页面停在“正在恢复会话” | 用上面的两个 `curl` 检查后端和代理，修复后点“重试”或刷新 |
| `EADDRINUSE`，或 Vite 改用 5174 | 确认占用进程属于本项目后，在对应终端 `Ctrl+C` 再启动。默认开发端口是 5173 / 3000 |

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,5173 |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

认证超时见 [客户端说明](client/README.md)。开发环境同时允许 `localhost:5173` 与 `127.0.0.1:5173`；生产环境把 `CORS_ORIGINS` 改为实际来源。

### 数据迁移

旧版 JSON 数据可以安全重跑，只复制、不删除原文件：

```powershell
cd server
npm run migrate:file-data
```

有权处理仓库内的《天龙八部》并接受把正文发给 Embedding 服务时，可以把它迁成只读系统示例书：

```powershell
npm run migrate:private-reader -- ../天龙八部.epub
npm run migrate:private-reader:backfill
```

第二条命令在系统书进入 `READY` 后，回填可识别的旧账号会话和小说内容类记忆。未注册的旧访客会话会被跳过。

## 测试

```powershell
cd server
npm run check

cd ../client
npm run check
```

后端已运行且外部依赖可用时，可以跑私人阅读闭环。脚本会创建临时账号和小说，结束时清理测试数据：

```powershell
cd server
npm run test:e2e:reader
```

默认 `npm test` 与 `npm run check` 不连接开发库。数据库集成测试必须显式提供隔离的 `TEST_DATABASE_URL`，规则见 [服务端说明](server/README.md)。

## 隐私与数据边界

- 私人上传按用户和书籍隔离，源文件不通过 API 返回。
- 公共书库复用只读 `SYSTEM` 书籍，仅登录用户可用。每人的助手、进度、对话和记忆仍然私有。
- PostgreSQL 是正文与引用的事实源。Milvus 只保存过滤字段和向量。
- 删除书籍会异步清理向量、源文件和数据库记录。系统示例语料不能由普通用户删除。
- 小说正文和召回记忆按不可信数据处理，不能覆盖平台提示词与权限规则。

## 文档

| 文档 | 内容 |
| --- | --- |
| [客户端说明](client/README.md) | 书房界面、回答模式、账号与阅读页 |
| [服务端说明](server/README.md) | API、索引生命周期、配置、迁移与门禁 |
| [阅读器设计](docs/superpowers/specs/2026-10-03-novel-reader-design.md) | 正文阅读与续读位置 |
| [私人阅读助手 MVP 设计](docs/superpowers/specs/2026-08-29-private-reading-assistant-mvp-design.md) | 早期范围与架构取舍；当前产品已包含完整阅读书房 |
| [书友客厅验收](docs/community-chat-acceptance.md) | 公共交流页的启用与验收 |
| [阅读器验收](docs/reader-acceptance.md) | 阅读页界面与合成数据验收 |
| [认证验收](docs/auth-email-acceptance.md) | 邮箱验证、找回密码与邮件 |
| [心绪塔罗验收](docs/tarot-acceptance.md) | 塔罗页面的配置与检查 |

## 许可

本仓库为私人项目。`client` 与 `server` 的包声明均为 `UNLICENSED`，未授予公开使用许可。
