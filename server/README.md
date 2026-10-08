# BookSoul Server

NestJS 11 API，提供账号认证、私人书架、EPUB/TXT 持久化处理、版本化向量检索、按书会话、阅读进度、防剧透、原文引用和隔离记忆。

新增 `CommunityModule` 提供一个显式加入的公共房间 `readers-lobby`，不调用私人 Chat/RAG/Memory。REST 位于 `/api/community`，原生 WS 位于同端口 `/api/community/ws`；协议及错误契约见[聊天室设计](../docs/superpowers/specs/2026-10-04-community-chat-design.md)。当前按单实例运行：票据和在线连接只在本进程，持久消息与事件由 PostgreSQL 保存；多实例广播不在本期范围。

首次启用前须核对数据库目标、备份和待部署迁移，单独部署 `20261004113000_community_chat`。本次仅生成新增表迁移，未运行真实迁移。`prisma migrate deploy` 会执行全部待应用迁移，包含工作区其他功能的迁移；不能把它当成只执行聊天室迁移的命令。若 Windows Prisma engine DLL 被既有进程占用，请正常停止占用进程后重新运行 `npm run prisma:generate`，不要覆盖或删除 DLL。

专用数据库回归命令为 `npm run test:db:community`，只接受显式 `TEST_DATABASE_URL`，并与 `DATABASE_URL` 完整比对；必须为独立 `*_test` 数据库及 `test_*` schema，不加载 `.env`，默认测试排除此组。管理员初始化命令 `npm run community:moderator -- --member-id=<公共成员UUID>` 默认只读预览，`--apply` 才授予指定房间一个成员权限；脚本要求进程显式提供 `DATABASE_URL`，不加载 `.env`。真实授予须单独核对目标指纹和影响后确认，不因代码已实现自动执行。

部署代理须保留 Origin、子协议和 Upgrade，公开站点使用 WSS，空闲超时需覆盖心跳；沿用现有 `CORS_ORIGINS`，缺失或不允许的 Origin 在 101 前拒绝，URL 不得带票据，日志不得记录票据/消息正文。客户端本地 Vite `/api` 代理已增加 `ws:true`，生产配置未改。发布前检查[验收记录](../docs/community-chat-acceptance.md)中的待验证项。

## 快速与深度书内问答

深度工具回合的文本保持私有，最终回答使用独立且禁用工具的模型回合，通过 SSE 逐段发送；最多四次主模型调用的上限不变。部分请求因此增加一次调用、延迟和费用。取消、阅读范围收紧或最终输出无效时返回错误，不保存未完成回答；显式记忆保存请求仍等待门控结果后展示正文。

`POST /api/chat` 的可选 `retrievalMode` 为 `quick`（缺省）或 `deep`。快速沿用普通 RAG（现有 Planner、Milvus 向量 + 当前可见 BookChunk 的 BM25）；深度采用 Agentic RAG，同样混合检索，主模型先理解本轮请求，由原生工具调用按需执行初次检索或补检，已有依据时直接回答；不按词表预先强制检索或召回记忆。普通确认可一个模型回合、零工具结束，事实查询通常为工具请求与依据原文回答两个回合。两种模式均由服务端限定当前用户、书籍、有效索引版本与阅读上限，与 `responseDepth`（回答详略）独立。

deep 支持已确认的本书记忆/全局偏好、本次允许的联网 MCP 路由和明确邮件意图的草稿工具；不直接绑定任意 MCP 工具。联网隔离路由只接收原问题与书名，邮件仍需用户确认发送。最多 4 个主模型回合、3 次工具执行、3 次书内检索，在线期限 90 秒；不再强制执行独立 plan/check 或固定 5 秒规划。工具回合缓冲完整后才展示最终回答，可能增加首字等待；有 `thinking` 心跳与可选 `runSummary`。成功后用原用户消息执行一次记忆门控，保存失败明确反馈。超时/检索失败显式报错，无自动模式或供应商切换。预算见[修正设计](../docs/superpowers/specs/2026-10-06-agentic-reading-revision-design.md)，工程与真实验收状态见[修正验收](../docs/agentic-reading-revision-acceptance.md)。

纯离线自检：`node -r ts-node/register test/run-deep-reading-offline.ts --fixtures test/fixtures/deep-reading-mode.json`。它不加载 .env、不连接数据库、不调用模型；输出是题集/评分计算校验，不能当作实际召回或质量提升。

真实验收仅使用专用 `test/start-deep-reading-acceptance.ts` 和 `test/run-deep-reading-live.ts`；需先核验独立数据库、书籍和记忆两个 `test_*` 向量集合、上传目录、准备好的合成 READY 书籍及 B0 记录，并获准实际调用费用。不得直接运行旧 reader E2E、修改实际环境、清库或重建生产集合来准备测试。

## 常用脚本

```bash
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
npm run check
```

`npm run check` 依次执行 lint、TypeScript 检查、单元测试和生产构建。`npm run lint` 不修改文件；需要自动修复时显式执行 `npm run lint:fix`。

阅读模块新增鉴权正文窗口 `GET /api/books/:bookId/sections/:sectionId/content?offset&limit`、引用定位 `GET /api/books/:bookId/chunks/:chunkId/location`，以及独立续读位置 `GET/PUT /api/books/:bookId/reading-position`。正文、定位和位置都由服务端核验当前身份与书籍权限；引用定位只针对当前索引版本。续读位置采用 revision CAS，409 时客户端须显式选择是否覆盖本窗口位置。确认保存到更后的章节时，同一事务会把阅读进度单调抬高到该章，并在响应里返回进度摘要；读取位置、临时浏览和 409 冲突都不改进度。已读完不会被回看改回。接口细节见[阅读器设计](../docs/superpowers/specs/2026-10-03-novel-reader-design.md)。

首次启用须在核对数据库目标与备份后单独部署新增的 `20261003090000_book_reading_position` 迁移。它只新增位置表及外键，不重写现有书籍、会话或聊天数据；代码或测试运行不代表迁移已部署。回填已有阅读位置的 `20261004183000_raise_reading_progress_from_position` 同样须单独核对目标后再部署：它只把进度向上抬到已保存的续读章节，不降低已有进度，也不改已读完的书。独立测试库完成迁移且 `TEST_DATABASE_URL` 通过现有隔离门禁后，可显式运行 `npm run test:db:reader` 检查并发 CAS、进度抬高和级联。不要对开发库或生产库运行此测试。

默认的 `npm test` 和 `npm run check` 不加载真实数据库集成测试。需要验证 Prisma 约束时，先创建独立测试数据库和测试 schema，再显式运行：

```powershell
$env:DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/booksoul?schema=public' # 只用于和测试目标比较，不运行应用库操作
$env:TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/booksoul_test?schema=test_prisma'
npm run test:db
```

门禁会拒绝缺失或非法的任一 URL，并完整比对 host、port、database、schema；只允许独立 `_test` 库和 `test_` schema，禁止 fallback 到应用库。测试仅清理已记录 ID / 邮箱或固定 allowlist，禁止全表清理。

## 认证与作用域

新注册须先申请邮箱验证码，再提交 6 位码和 verificationId；验证成功后才创建账号。旧账号尚未验证邮箱仍可正常登录，补验证只更新当前用户状态。找回密码使用邮件中的一次性链接，成功后要求普通登录，并让旧 Access / Refresh Token 在后续请求失效。现有 logout-all 语义不扩展。

邮件配置增加独立的 `AUTH_CHALLENGE_SECRET` 和受信任的 `AUTH_PUBLIC_BASE_URL`，继续复用现有 SMTP。接口、策略及本地 / 外部验收边界见[认证设计基线](../docs/superpowers/specs/2026-10-02-jwt-email-verification-password-reset-design.md)与[验收记录](../docs/auth-email-acceptance.md)。真实环境必须先扩展迁移并同一窗口升级前后端；当前未执行发布验收。

验证码、重置链接、改密通知与用户确认发送的阅读笔记使用统一“AI 藏书室”品牌 HTML 邮件，同时保留纯文本版本。共享外观位于 `src/mail/mail-template.ts`，认证文案位于 `src/auth/auth-mail.templates.ts`；书本 Logo 以 PNG 随邮件内嵌，不依赖公开图片地址或客户端构建。重置按钮及备用链接沿用受信任地址，动态内容做 HTML 转义，认证服务不接受调用方提供任意 HTML。修改模板后须重启认证验收服务，重新收件检查实际邮箱客户端的显示。

本机真实收件验收使用 `npm run start:auth:acceptance`，入口位于 `test/start-auth-acceptance.ts`，复用实际 AuthModule / MailModule。它在创建服务前要求两个显式数据库 URL，并仅接受 `127.0.0.1:5432 / booksoul_test / test_auth`；要求临时邮件认证配置、受控收件人 `AUTH_ACCEPTANCE_RECIPIENT` 及明确发信许可 `AUTH_ACCEPTANCE_SEND_MAIL=yes`。入口只在本机 3000 端口提供认证 API，邮件禁止其他收件人及抄送，不加载书籍、记忆、向量库或索引 worker。操作顺序和限制见[收件验收步骤](../docs/auth-email-acceptance.md#本机认证服务与收件步骤)。

- 登录和注册返回 `{ accessToken, user }`，同时设置 `booksoul_refresh` HttpOnly Cookie。
- `POST /api/auth/refresh` 与 `POST /api/auth/logout` 从 Cookie 读取刷新令牌。
- Access Token 默认 15 分钟；过期后客户端用 Refresh Token 静默轮换，不应要求重新登录。Refresh Token 默认滚动有效 7 天，连续 7 天未使用或令牌被吊销后才需要重新登录。
- 私人书籍接口使用 `Authorization: Bearer <access-token>`。
- owner 始终来自服务端认证上下文；聊天请求只接受 `sessionId`、`message` 与单次 `spoilerOverride`。
- session 在服务端反查 assistant、book、owner、embedding version 与 spoiler ceiling。

## 书籍处理生命周期

上传只保存文件并创建持久任务。worker 依次执行解析、分节、切块、批量 Embedding、Milvus 写入和一致性核对，成功后书籍进入 `READY`。失败会保留稳定错误码并支持重试；进程重启后会回收超时租约。

单书问答采用 Milvus 向量召回与服务端 BM25 混合检索。BM25 仅使用 PostgreSQL `BookChunk` 中当前书籍、当前版本及阅读上限内的正文计算统计；无需补建索引、重新上传或在 Milvus 保存正文。融合策略、资源预算、验证结果与限制见[混合检索验收记录](../docs/hybrid-retrieval-acceptance.md)。

删除先把书籍置为 `DELETING`，再可靠清理向量、源文件和 PostgreSQL 记录。部分失败不会误报完成，后台会继续重试。

公共书库使用现有 `SYSTEM` 类型，由管理侧维护。书籍接口继续要求 JWT 登录，未登录用户停留在登录页；所有登录用户可见共享书籍，普通用户不能删除或重新处理共享原文。每位用户的助手、进度、会话与记忆仍按 owner/book 隔离，不随书籍迁移公开。

将已有 `READY` 私人书籍迁入公共书库时，保留 book id、章节和片段 id，备份数据库、原文及对应 owner/book/version 的向量，停止 API 和 worker 后再迁移。需同步把向量 `owner_scope` 改为 `__system__`，完成逐条校验后在事务内把书籍改为 `visibility=SYSTEM, ownerId=null`；既有个人数据保持原关联。复用已有向量无需再次调用 Embedding。仅修改数据库可见性会造成检索范围与向量归属不一致。

## 配置

复制 `.env.example` 为 `.env`。启动时会拒绝缺失的 `DATABASE_URL`、少于 32 位或仍为示例值的 `JWT_ACCESS_SECRET`，以及非法的数值配置。

生产环境必须：

- 把 `CORS_ORIGINS` 设置为真实前端来源，可用逗号分隔多个来源；
- 使用独立随机的 JWT 密钥；
- 通过密钥管理服务注入数据库、模型和 Milvus 凭据；
- 使用私有、持久化的 `BOOK_UPLOAD_DIR`；
- 不记录密码、Token、Cookie、正文、完整访客标识或私有路径。

### Agent 并发准入

实时聊天在进入模型调用前依次占用“当前会话、当前用户、系统全局”三个并发名额。同一会话只允许一个活动 Run；超过用户上限时返回 `429 AGENT_USER_LIMIT`，超过系统容量时返回 `429 AGENT_CAPACITY_EXCEEDED`，会话已在生成时返回 `409 AGENT_SESSION_BUSY`。客户端断开、运行结束或租约丢失都会释放名额；租约丢失同时会取消仍在执行的模型和工具调用。

`AGENT_ADMISSION_MODE=local` 仅供单个 API 实例开发或部署，计数不跨进程。多个 API 实例必须使用 `redis`，并配置仅服务端可访问的 `REDIS_URL`。Redis 中只保存带 TTL 的 `ownerId`、`sessionId` 和 `runId` 租约键，不保存问题、回答、原文或邮箱；PostgreSQL `AgentRun` 只保存运行作用域、状态和时间。Redis 不可用时请求默认失败，不会绕过并发门禁。

Redis 模式启动时最多等待 5 秒，包含客户端重连；连接失败后关闭客户端并返回脱敏错误，终止启动。出现 `Redis admission store connection error` 时先检查现有 Redis 服务是否运行及配置端口是否可达；使用 WSL 内 Redis 时先启动对应发行版，并保持 WSL 会话运行，避免发行版退出后本机端口转发消失。重启 API 前确认 3000 端口没有遗留后端进程占用。运行期间 Redis 断开仍拒绝并发准入，不自动切换本地模式。

默认每用户最多 2 个、全局最多 20 个活动 Run。`AGENT_MAX_CONCURRENT_PER_USER`、`AGENT_MAX_CONCURRENT_GLOBAL`、`AGENT_RUN_LEASE_TTL_MS`、`AGENT_RUN_HEARTBEAT_MS` 和 `AGENT_RETRY_AFTER_SECONDS` 可按模型 RPM/TPM 与压测结果调整；心跳间隔必须小于租约时长的一半。修改真实部署配置前先核对模型配额、数据库连接池和预期峰值，不要把 `REDIS_URL` 写入日志或提交仓库。

### 可选联网资料检索

填写 `TAVILY_API_KEY` 即会启用 Tavily 远程 MCP。`TAVILY_MCP_URL`、`MCP_ALLOWED_TOOL_NAMES` 和 `MCP_TOOL_TIMEOUT_MS` 已有默认值；当前只允许只读的 `tavily_search`，不开放 extract、crawl、map 或写工具。Key 只能通过密钥管理或 `.env` 注入，不要放入 URL、日志或仓库。

联网检索必须由用户在当次请求显式设置 `externalResearch: true`。该字段只授予本轮权限：模型先在只含当前问题与必要书名的隔离上下文中自行决定是否调用一次 `tavily_search`，服务端再验证工具名与参数并执行 MCP。小说正文、会话历史、用户记忆、owner 和 book id 不进入工具决策或搜索请求。返回内容按不可信资料清洗与限长，通过 `ToolMessage` 交回模型，并与书内章节引用分开返回。

### 可选邮件发送

如需在聊天回答上使用“发送到邮箱”，配置 `SMTP_USER`、`SMTP_PASS` 和 `SMTP_FROM`；非 QQ 邮箱还需设置 `SMTP_HOST`、`SMTP_PORT` 与 `SMTP_SECURE`。密码应使用邮件服务商的 SMTP 授权码，不要提交到仓库。

聊天模型仅在当前用户消息明确要求发送邮件时获得 `prepare_email` 工具。模型负责生成结构化的收件人、主题和纯文本正文，工具只通过 SSE 返回可编辑草稿；小说正文、外部资料、记忆和历史消息不能授予工具权限，显式收件人在进入检索前会被脱敏。

`POST /api/tools/email` 只接受 JWT 登录用户，要求请求体携带 `confirmed: true`，并限制为每来源每分钟 5 次。无论草稿来自回复邮件按钮还是模型工具，只有用户点击“确认并发送”后才调用该接口；模型不能直接执行 SMTP 投递。

阅读笔记的收件人、主题和纯文本正文仍来自用户确认的草稿。服务端仅对主题和正文做 HTML 转义并套用共享邮件外观，不解析用户 HTML，也不向邮件模板加入其他书籍或账号数据。

阅读笔记、注册验证码、邮箱验证、找回密码和改密通知共用黑白灰纸面模板与“AI 藏书室”品牌。模板使用内联样式、表格和嵌入式标识，保留纯文本备选，不加载远程字体或背景图片。

## 迁移

### 用户资料与私人图片

账号资料接口位于 `/api/users/me`，只允许 JWT 用户操作本人名称、头像、壁纸图库和随机/固定偏好。上传采用 OSS POST 直传临时对象，再经服务端真实解码、静态图片校验和 WebP 规范化后提交；原图不经应用 multipart 接口。正式对象保持私有，仅向本人提供 15 分钟读取链接。图库、上传配额和资料 revision 在用户行锁下维护，重复确认不恢复旧头像。

OSS 配置是可选且须整组填写的 `OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`，可选 `OSS_ENDPOINT` 仅接受匹配地域的阿里云 HTTPS 地址。完全留空时仍可修改名称和系统壁纸，部分填写会阻止启动。真实密钥、私有 Bucket/RAM 权限、浏览器 CORS、暂存生命周期与收费说明以[实施方案](../docs/superpowers/plans/2026-10-04-user-profile-oss-media.md)为准；不要公开 Bucket 或将凭据发送到客户端。

新增迁移 `20261004100000_user_profile_media` 为加法迁移，部署前须核对目标、备份和所有待部署迁移，确认后再执行 `npm run prisma:migrate:deploy` 与 `npm run prisma:generate`；本机后续授权部署结果见[验收记录](../docs/user-profile-media-acceptance.md)，不代表其他环境已部署。媒体 owner 外键限制删除账号，避免丢失待清理对象记录；当前不扩展账号删除功能。

`npm run profile-media:cleanup` 默认为只读 dry-run；`-- --execute` 才会删除经过归属、状态、引用与保留期限复查的精确对象。READY 只清理签发过期的暂存图，并记录 `stagingCleanedAt`，从不删除正式对象；其他失败、过期或退役对象保留 24 小时后才可清理。真实删除须另行确认，不运行默认定时任务。专用数据库测试 `npm run test:db:profile` 要求显式且隔离的 `TEST_DATABASE_URL`，不加载 `.env` 或进入默认 Jest 范围。实际验收与未验证项见[验收记录](../docs/user-profile-media-acceptance.md)。

`npm run migrate:file-data` 可幂等复制旧 JSON 数据，不删除源文件。

`npm run migrate:private-reader -- ../天龙八部.epub` 可创建稳定的只读系统示例书。正文随后会发送给当前 Embedding 服务并写入当前 Milvus 目标，因此执行前必须确认文件处理权限和外部数据目的地。书籍 READY 后执行 `npm run migrate:private-reader:backfill`，把可识别的注册用户旧会话和小说内容类记忆绑定到各自的系统书助手；账号偏好与用户事实仍保持全局。

## 心绪塔罗

`TarotModule` 提供登录用户专用的四个 POST 端点 `/api/tarot/classifications|draws|reveals|readings`。复用现有 JWT 认证；牌堆、问题与揭晓顺序由服务端按 owner 保存在内存，客户端不能指定牌面。同许可证洗牌和同下标揭晓均幂等，断流可用原局重新解读；不会接入书籍、RAG、记忆、公共聊天或 Prisma 写入。

可选 `TYPESAFE_API_KEY` 与 HTTPS 根地址 `TYPESAFE_API_BASE`（默认 `https://api.typesafe.ai`）用于 Jev 分类。未配置或占位密钥时不发网络请求，用户自行选择牌阵；异常、无效响应与 5 秒超时也进入自选，取消不签发新许可证。解读沿用现有 `openai` 配置，最多 800 输出 token、零自动重试，总截止时间沿用 `openai.requestTimeoutMs`。提问会发送到分类与解读供应商，保留策略尚未核实，请勿提交敏感信息。

目前仅支持单进程：重启丢失局状态，多实例需先设计共享状态，不能直接水平扩容。许可证 10 分钟、局 30 分钟，每分钟清理；最多 1,000 份当前状态，外部调用全局 20、每用户 1。每用户每 10 分钟分类／洗牌／揭晓／解读分别限 10／10／30／10 次，重试计次。接口契约与错误码见[设计规格](../docs/superpowers/specs/2026-10-05-ai-tarot-design.md)，离线验证见[验收记录](../docs/tarot-acceptance.md)。

Jev 分类也可通过胜算云接入。在本地 `server/.env` 配置下列字段，将胜算云密钥填入 `TYPESAFE_API_KEY` 后重启服务端（密钥仅保存在服务端）：

```dotenv
TYPESAFE_API_KEY=
TYPESAFE_API_BASE=https://router.shengsuanyun.com
TYPESAFE_API_PATH=/api/v1/decisions
TYPESAFE_MODEL_NAME=typesafe/jev-latest
```

未设置路径与模型名时仍默认 `/v1/systemone` 与 `jev-latest`，保持 TypeSafe 官方接入兼容。胜算云调用协议见[官方 Jev 文档](https://lean.shengsuanyun.com/apidocs/api/decisions/jev-api)。分类仅发送当前塔罗问题与固定牌阵选项，不发送小说正文或书内聊天；上游数据保留策略尚未核实，费用以控制台当前报价为准。此配置不改变小说聊天和 Embedding 供应商。

## 端到端验收

服务运行且 PostgreSQL、模型与 Milvus 可用时：

```bash
npm run test:e2e:reader
```

脚本覆盖上传、READY、目录、阅读进度、助手设置、引用、防剧透、按书记忆、历史和删除清理，并自动删除临时用户。
