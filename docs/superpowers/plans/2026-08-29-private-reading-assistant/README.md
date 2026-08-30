# BookSoul 私人阅读助手 MVP：实施索引

> **使用方式：** 按依赖顺序交付可测试的垂直切片。每项必须同时完成代码、迁移、失败路径、权限测试和运行文档，不能只完成页面或只完成数据表。

**总目标：** 用户可以上传多本私人小说，为每本书获得独立、可引用原文、按阅读进度限制剧透的阅读助手；不同用户和不同书籍之间不存在文件、检索、会话或记忆串线。

**原始设计：** [2026-08-29-private-reading-assistant-mvp-design.md](../../specs/2026-08-29-private-reading-assistant-mvp-design.md)

## 固定约定

1. 私人书籍功能需要登录，owner 一律来自服务端 `AuthContext.userId`。
2. 客户端不能决定 Milvus 的 owner/book filter；聊天只提交服务端生成的 session id。
3. PostgreSQL 保存正文与引用的事实源，Milvus 只保存向量和过滤字段。
4. 防剧透必须同时约束检索、正文 hydrate、生成 Prompt 和输出引用。
5. 一本书一期只创建一个私人助手；固定角色不再作为一级产品对象。
6. 上传请求只可靠接收文件并创建持久化任务，不同步等待解析或 Embedding。
7. 私有上传不跨用户去重，文件和向量默认不可公开。

## 交付清单

| 顺序 | 编号         | 闭环需求                                               | 状态                       | 依赖                      |
| ---- | ------------ | ------------------------------------------------------ | -------------------------- | ------------------------- |
| 1    | BOOK-01      | 书籍领域模型、私有文件存储、Books API 与权限隔离       | 已完成                     | 现有 Auth/Prisma          |
| 2    | INGEST-01    | EPUB/TXT 解析、规范化 section 与安全限制               | 已完成                     | BOOK-01                   |
| 3    | INGEST-02    | 持久化 worker、分块、进度、失败重试与崩溃恢复          | 已完成                     | INGEST-01                 |
| 4    | VECTOR-01    | `book_chunks_v2`、批量 Embedding、版本化写入与可靠删除 | 已完成                     | INGEST-02                 |
| 5    | ASSISTANT-01 | READY 自动创建 BookAssistant 与通用小说 Prompt         | 已完成                     | VECTOR-01                 |
| 6    | PROGRESS-01  | 阅读进度、section 目录、防剧透 ceiling 与单次放行      | 已完成                     | ASSISTANT-01              |
| 7    | CHAT-02      | 服务端会话创建、session → book scope、按书历史与引用   | 已完成                     | ASSISTANT-01、PROGRESS-01 |
| 8    | MEMORY-02    | 全局偏好与 book-scoped 记忆隔离                        | 已完成                     | CHAT-02                   |
| 9    | CLIENT-05    | 私人书架、上传、处理状态与失败重试                     | 已完成                     | INGEST-02                 |
| 10   | CLIENT-06    | 书籍工作区、按书会话、目录与阅读进度                   | 已完成                     | CHAT-02、PROGRESS-01      |
| 11   | MIGRATE-01   | 《天龙八部》系统示例、旧会话回填与去角色化             | 实现完成，执行待授权       | CHAT-02、CLIENT-06        |
| 12   | RELEASE-02   | 隔离、恢复、删除、剧透与端到端发布验收                 | 验收完成，发布待系统书授权 | 其余全部                  |

## 当前交付：BOOK-01

已完成：

- Prisma 新增 Book、BookSection、BookChunk、BookAssistant、ReadingProgress、IngestionJob 及枚举。
- ChatSessionRecord 预留 `bookAssistantId/title`，MemoryRecord 预留 `bookId`。
- 上传仅接受 EPUB/TXT，限制大小、校验签名/二进制内容并计算 SHA-256。
- 文件保存到服务端生成的 `private/{ownerId}/{bookId}/source.ext`，不使用原始文件名拼路径。
- 创建 Book 时同事务创建持久化 QUEUED IngestionJob。
- Books 上传、列表、详情和删除 API 全部要求 JWT，并按 owner 或 SYSTEM 可见性过滤。
- 同用户重复内容拒绝，数据库失败时清理已落盘文件。
- 权限、上传、路径与删除测试已覆盖。

## 当前交付：INGEST-01

已完成：

- 统一 `BookParserService`、`ParsedBook`、`ParsedSection` 与稳定 `IngestionError` 错误码。
- TXT 严格 UTF-8 解码并回退 GB18030，拒绝 UTF-16/二进制内容。
- TXT 识别中文章/节/回/卷与 `Chapter N`，无目录时按配置长度稳定分节。
- EPUB 在解析前校验 entry 数量、原始路径、声明解压体积、异常压缩比和 mimetype。
- EPUB 按 spine 顺序提取，移除 script/style/iframe/svg 等活动或无关内容。
- EPUB 标题页与紧随正文合并，避免把章节标题和正文拆成两个 section。
- 本地私有存储新增受校验的 `withLocalPath` 边界，供后续 worker 调用解析器。
- 最小 EPUB fixtures 覆盖元数据、顺序、脚本清理、损坏包、路径穿越和压缩炸弹。
- 真实《天龙八部》文件验收：识别 61 个规范化 section、约 124 万正文字符。

## 当前交付：INGEST-02

已完成：

- 单实例轮询 worker 原子领取最早的 QUEUED 任务，并通过条件更新避免重复消费。
- 任务状态依次推进为 PARSING、CHUNKING；解析落库后书籍进入 EMBEDDING，等待 VECTOR-01。
- 文本按可配置长度与重叠量稳定切块，优先在段落、换行和句末边界断开，并保存精确字符偏移。
- section 与 chunk 由同一事务批量重建；书籍元数据、计数、进度和任务完成状态一并提交。
- RUNNING 任务保存锁定时间和心跳；worker 启动及每轮执行时回收超过阈值的僵尸任务。
- 删除与 worker 并发时通过书籍状态条件更新丢弃租约，避免已删除书籍被重新写回处理中状态。
- 解析错误只写稳定错误码和用户安全消息；未知异常统一为 `INTERNAL_PROCESSING_ERROR`。
- `POST /api/books/:bookId/retry` 只允许所有者重试 FAILED 私有书籍，并原子重置书籍与任务。
- 新增 `BOOK_CHUNK_SIZE`、`BOOK_CHUNK_OVERLAP`、`BOOK_INGESTION_POLL_MS`、`BOOK_INGESTION_STALE_MS` 和 `BOOK_INGESTION_WORKER_ENABLED` 配置。
- 真实 PostgreSQL 闭环验收已通过：上传 TXT、领取、解析、切块、持久化、状态推进与测试资源清理均成功。

本地运行说明：默认启动 API 时同时启动 worker；只运行 API、不消费任务时可设置 `BOOK_INGESTION_WORKER_ENABLED=false`。书籍在本阶段正常停留于 `EMBEDDING / 30%`，不是处理失败。

## 当前交付：VECTOR-01

已完成：

- 新建 `book_chunks_v2` collection，仅保存 chunk id、owner/book/section/version 过滤字段和向量，不把正文复制到 Milvus。
- 自动识别带 `https://` 的 Zilliz Cloud 地址，规范化为 TLS gRPC `:443` 连接；本地无协议地址保持兼容。
- collection 创建后校验必需字段和向量维度，已有 schema 不兼容时安全失败，不自动删除或重建线上 collection。
- 使用小批量 Embedding 请求，校验返回数量、1024 维度与有限数值；失败采用有限指数退避并写稳定错误码。
- 每次重建先按 `owner_scope + book_id + embedding_version` 清理部分向量，再按 PostgreSQL chunk 顺序幂等写入。
- 每批写入前后检查持久任务租约，按完成比例推进 EMBEDDING 进度；最终 flush 并核对 PostgreSQL 与 Milvus 数量后才进入 READY/100%。
- Embedding 或 Milvus 失败时清理部分写入并将书籍置为可重试 FAILED，未知内部异常不会进入用户消息。
- 删除接口改为持久化 DELETING 队列；worker 优先删除该 owner/book 的全部版本向量，再删源文件与 PostgreSQL 记录。
- 删除失败保持 DELETING 并自动延迟重试；重复 DELETE 可立即重新排队失败任务，所有清理步骤均可幂等重复。
- 真实服务闭环已通过：批量 Embedding 返回 2 条 1024 维向量；临时书籍成功进入 READY，向量数与 PG chunk 数均为 2；删除后向量、源文件和书籍记录均归零。

新增配置：`MILVUS_BOOK_COLLECTION_NAME`、`BOOK_EMBEDDING_BATCH_SIZE`、`BOOK_EMBEDDING_MAX_ATTEMPTS`、`BOOK_EMBEDDING_RETRY_BASE_MS`、`BOOK_DELETION_RETRY_MS`。

## 当前交付：ASSISTANT-01

已完成：

- 私有书籍从 EMBEDDING 进入 READY 的同一 PostgreSQL 事务中，幂等创建 `ownerId + bookId` 唯一 BookAssistant。
- 默认名称为“《书名》阅读助手”，长度受限；重复完成任务或 GET 修复不会创建第二个助手。
- 新增 `GET/PATCH /api/books/:bookId/assistant`，只允许当前 JWT 用户访问自己的私有书或可见系统书。
- 书籍未 READY 时拒绝使用助手；不存在或属于其他用户的书统一返回不存在。
- 支持修改名称、回答深度、语气和最长 1000 字的自定义指令；空 patch 和空白名称被拒绝。
- 通用系统 Prompt 不含《天龙八部》或固定角色，明确当前书籍是唯一小说事实域。
- Prompt 把上传正文和检索片段视为不可信数据；自定义指令位于隔离、引用和防剧透规则之后，不能覆盖平台边界。
- 真实 PostgreSQL 验收通过：READY、任务 SUCCEEDED 与默认助手创建原子提交，随后配置更新成功且助手数量保持 1。

## 当前交付：PROGRESS-01

已完成：

- READY 私有书在创建助手的同一事务中幂等创建 NOT_STARTED 阅读进度；系统书或历史缺失记录可按用户惰性修复。
- 新增 `GET /api/books/:bookId/sections`，只返回 section id、顺序、标题和字符数，不返回整章正文。
- 新增 `GET/PUT /api/books/:bookId/reading-progress`，所有读写从 JWT owner 和服务端可见书籍推导作用域。
- `NOT_STARTED`、`IN_PROGRESS`、`FINISHED` 分别计算 spoiler ceiling 为 1、当前章节和全书末章。
- IN_PROGRESS 必须提供确实属于当前书籍的 section order；矛盾状态和外书章节被拒绝。
- 内部 `getRetrievalBoundary` 只返回服务端生成的 owner scope、book id、active embedding version 和 spoiler ceiling。
- 单次 spoiler override 只提升当前调用的 ceiling，不修改持久化阅读进度。
- 真实 PostgreSQL 验收通过：3 章目录不泄露正文，三种状态 ceiling 为 1/2/3，override 临时为 3，进度记录始终唯一，其他用户得到 404。

## 当前交付：CHAT-02

已完成：

- 新增 `POST/GET /api/books/:bookId/sessions`，会话 UUID 只能由服务端生成，并绑定当前用户的当前书籍助手。
- `POST /api/chat` 请求只接受 `sessionId + message + spoilerOverride + externalResearch`，不再接受角色或客户端指定的书籍/owner；`externalResearch` 只对当次显式联网生效。
- session 反查链同时验证 session owner、assistant owner、book visibility 与 READY 状态；历史读取和删除复用同一边界。
- Milvus 搜索 filter 固定包含 `owner_scope + book_id + embedding_version + section_order <= ceiling`，自由文本不能进入 filter。
- Milvus 仅返回 chunk id/score；PostgreSQL 再按预期 book/version/ceiling 查询正文和章节标题，外书 id 被丢弃。
- 相邻重叠 chunk 按得分去重；对外引用包含 book/section/chunk 元数据和短 excerpt，不返回完整 chunk 正文。
- 新的通用书籍聊天流使用 BookAssistant Prompt、最近会话消息和不可信原文片段，流式返回回答与章节引用。
- 首轮有效问答后服务端更新会话标题并原子追加 user/assistant 消息；中断流不写入不完整回答。
- 真实服务验收通过：未开始状态只命中第一章，单次 override 才能命中第二章；跨用户 session 返回 404，SSE 引用未越界，删除后向量归零。

## 当前交付：MEMORY-02

已完成：

- `MemoryEntry` 与 PostgreSQL repository 正式读写可空 `bookId`；book-scoped 查询只返回全局记录与当前书籍记录。
- 新书籍聊天中的明确剧情笔记、人物判断和伏笔记录会绑定当前 `bookId`；通用回答偏好和用户事实仍保持账号级全局作用域。
- 普通剧情讨论仍不会自动成为长期记忆；只有明确事实、偏好或“请记住”请求通过记忆门，敏感凭据继续被拒绝。
- 当前书籍上下文只召回已确认记忆；其他书籍、其他用户、未确认提案和其他会话的 episodic 记忆均被应用层再次剔除。
- 新阅读助手不使用旧的仅按用户过滤的 Milvus 记忆搜索；以 PostgreSQL 的 `ownerId + (bookId IS NULL OR bookId = current)` 查询作为隔离事实源。
- 召回内容以不可信用户上下文注入，明确不能充当小说原文或指令，并对标签字符转义。
- 回答成功持久化后才尝试记忆写入；记忆服务暂时失败只降级本轮记忆功能，不会丢失已经生成的书籍回答。
- 新增跨书隔离、全局偏好共享、书内笔记、未确认记忆过滤、Prompt 转义和 SSE `memoryUpdate` 回归测试。

## 当前交付：CLIENT-05

已完成：

- 登录后首页改为私人书架，支持 EPUB/TXT 点击选择和拖放上传。
- 书籍卡片显示处理进度、失败原因、目录节数与阅读状态；处理中自动轮询，失败可重试。
- 删除操作需要确认，并明确告知向量、源文件、会话和记忆将由后台可靠清理。
- 系统示例书与私人上传使用同一视图模型，系统书不显示删除入口。
- 上传、列表、READY 打开、未就绪拒绝和删除均有 store 测试。
- 浏览器真实验收发现并修复中文 multipart 文件名乱码；新增回归测试。
- 空书架、加载、网络失败、重试和未登录状态均有明确反馈。

## 当前交付：CLIENT-06

已完成：

- 单书工作区替换固定角色聊天，侧栏包含返回书架、目录、阅读进度、按书会话和助手设置。
- 客户端只把服务端创建的 `sessionId` 发送给聊天接口，不再发送角色、owner 或 book id。
- SSE 接入内容、结构化章节引用和记忆更新；切书、切会话和新建会话会中止旧请求并隔离状态。
- 阅读状态支持未开始、阅读中和已读完；全书检索仅作为单次显式放行，不修改持久进度。
- 助手名称、回答深度、语气和自定义要求可以在当前书籍内配置。
- 桌面侧栏可调宽，移动端使用抽屉；支持亮色、暗色、系统主题和减少动态效果。
- 桌面、390px 移动端和暗色浏览器验收通过，均无横向溢出。

## 当前交付：MIGRATE-01

实现已完成，真实系统书索引待单独授权：

- 新增稳定系统书 ID、受约束的 `system/{bookId}/source.*` 存储路径和幂等 seed 命令。
- 系统书以 `owner_scope = "__system__"` 进入 `book_chunks_v2`，普通用户不能重试或删除系统语料。
- READY 后可为注册用户幂等创建各自的助手和阅读进度，并回填 `bookAssistantId` 与小说内容类旧记忆的 `bookId`；全局偏好和用户事实不改作用域。
- 无对应 User 的旧访客会话不会伪造身份，迁移会保留并报告跳过数量。
- 固定角色、旧 RAG、高德 MCP 与旧邮件入口已从应用运行图和公开路由移除；旧源码暂留作迁移审计，不进入新产品主链。新增的 Tavily MCP 只作为用户显式开启的只读联网资料通道，不受模型或正文自动调用。
- 客户端固定角色入口已完全退出运行路径，角色兼容文件不进入构建产物。
- 真实《天龙八部》索引会把正文发送到当前外部 Embedding/Zilliz 目标，必须在确认文件处理权和数据目的地后执行。

## 当前交付：RELEASE-02

验收已完成，正式激活系统示例书仍待数据外传授权：

- 服务端 38 个测试套件、174 项测试全部通过；lint 为 0 error，TypeScript 和生产构建通过。
- 客户端 9 个测试文件、35 项测试全部通过；lint、TypeScript 和 Vite 生产构建通过。
- 真实合成小说闭环验证 READY、两节目录、助手配置、第一节默认边界、第二节单次放行和持久进度不变。
- 第二个真实账号无法读取第一位用户的书籍、会话列表和聊天历史，三个入口均返回 404。
- SSE 返回结构化章节引用；书内记忆写入当前 `bookId`；八条会话消息可恢复。
- 删除完成后书籍、向量、源文件与级联数据清理成功；两轮浏览器验收用户和最终 E2E 用户均已清零。
- 桌面书架、桌面工作区、390px 移动端和暗色模式完成截图验收，无横向溢出。
- 数据库仍有 3 个旧版未绑定会话，将在系统书 READY 后由幂等回填命令处理。

当前唯一发布阻塞项：确认是否允许把仓库内《天龙八部》正文发送到当前配置的外部 Embedding 服务并写入 Zilliz。未经确认不会执行，也不会绕过该边界。

## 通用完成标准

- [ ] 正常、失败、重试和越权路径均有测试。
- [ ] 所有资源查询从认证身份推导作用域，不信任 body/path 中的 owner。
- [ ] 迁移可在干净 PostgreSQL 上按顺序执行。
- [ ] `lint`、`typecheck`、单元测试和 build 通过。
- [ ] API 不返回 storageKey、绝对路径、正文全文或内部错误堆栈。
- [ ] 新配置进入 `.env.example`，运行方式进入 README/实施索引。
- [ ] 删除和重试操作幂等，部分失败不会误报完成。
