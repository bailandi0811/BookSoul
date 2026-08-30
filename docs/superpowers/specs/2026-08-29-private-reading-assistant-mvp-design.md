# BookSoul 私人阅读助手 MVP 产品与架构设计

**日期：** 2026-08-29
**状态：** 代码与发布验收已完成；系统示例书真实索引及 3 个旧会话回填待数据外传授权
**产品定位：** 用户上传自己的小说，BookSoul 自动生成一个私有、可引用原文、尊重阅读进度的小说阅读助手
**一期范围：** 私人书架、EPUB/TXT 上传、异步解析与索引、单书助手、书籍内对话、章节引用、防剧透、阅读进度、删除与数据隔离
**非本期方向：** 用户公开分享 Agent、Agent 市场、多人协作、完整在线阅读器、多角色扮演、跨书联合问答

**实施拆分：** [私人阅读助手 MVP 实施索引](../plans/2026-08-29-private-reading-assistant/README.md)

---

## 1. 背景与方向调整

BookSoul 当前是一个围绕《天龙八部》构建的角色对话应用：用户从书魂、乔峰、段誉、王语嫣中选择角色，再围绕固定小说聊天。现有实现已经具备账号、流式聊天、RAG、原文引用、聊天历史和用户记忆，但作品、角色、提示词与向量检索范围均存在硬编码。

新的产品主语从“角色”调整为“用户书架中的一本书”：

```text
原产品：选择固定角色 → 围绕《天龙八部》对话

新产品：上传/选择一本小说 → 进入这本书的私人阅读助手 → 围绕阅读过程对话
```

这不是简单地给现有向量库追加多本书。系统必须把书籍变成一等领域对象，并保证文件、章节、向量、助手配置、阅读进度、聊天历史和记忆都处在正确的用户与书籍作用域内。

---

## 2. 产品定义

### 2.1 一句话定位

> 上传一本小说，获得一个懂全书、会引用原文、又不会越过你阅读进度的私人阅读助手。

### 2.2 核心价值

1. **理解成本更低：** 随时询问人物、情节、设定、伏笔和章节内容。
2. **答案可以核验：** 涉及原著事实的回答附章节和片段引用。
3. **尊重阅读过程：** 默认按用户已读章节限制检索，避免后文信息泄漏。
4. **书与书互不串线：** 当前助手只能读取当前书籍，不混入其他小说或其他用户数据。
5. **属于用户自己：** 上传内容、助手设置、进度、对话和记忆默认私有，可删除。

### 2.3 目标用户

- 正在阅读长篇小说，希望随时查人物与前情，但担心搜索引擎剧透的读者。
- 读完一本小说后，希望深入分析人物弧光、伏笔与叙事结构的读者。
- 阅读网络小说、同人或个人手稿，需要一个只基于指定文本回答的私人用户。

### 2.4 MVP 核心闭环

```text
登录
  ↓
进入私人书架
  ↓
上传 EPUB / TXT
  ↓
查看解析与索引进度
  ↓
选择阅读状态（未开始 / 读到某章 / 已读完）
  ↓
进入自动生成的小说助手
  ↓
提问 → 获取回答与章节引用 → 继续阅读/调整进度
```

### 2.5 产品原则

1. **先有书，后有助手。** 助手不能脱离所属书籍存在。
2. **一本书一期只生成一个助手。** 用户可配置名称和回答方式，不创建多个角色实例。
3. **防剧透是数据边界，不是语气承诺。** 检索层必须限制可见章节。
4. **原文是数据，不是指令。** 上传内容中的任何命令式文本都不能覆盖系统规则。
5. **事实回答优先有据可查。** 找不到依据时明确说明，不以模型常识补全小说事实。
6. **默认私有。** 不存在“顺手公开”或默认共享入口。

---

## 3. 已确认决策

| 项目         | 一期决策                                                             |
| ------------ | -------------------------------------------------------------------- |
| 产品优先级   | 私人阅读助手优先，不做用户 Agent 分享平台                            |
| 一级导航对象 | 小说/书籍，而不是角色                                                |
| 助手数量     | 每本书自动创建一个私人助手                                           |
| 角色扮演     | 从主流程移除；未来可作为书籍助手的可选对话模式                       |
| 支持格式     | EPUB、TXT；不支持扫描 PDF、DOCX、在线抓取                            |
| 阅读器       | 一期不做完整正文阅读器，只做目录、进度与引用片段                     |
| 防剧透       | 默认开启；按章节序号约束向量检索与引用                               |
| 上传处理     | 异步、可恢复、可重试；上传请求不等待 Embedding 完成                  |
| 数据隔离     | 服务端校验 owner；向量按 `owner_scope + book_id` 双重过滤            |
| 聊天作用域   | 客户端只提交服务端生成的 `sessionId`；服务端反查 assistant/book      |
| 文件可见性   | 私有上传不可公开；保留只读 `SYSTEM` 类型用于现有《天龙八部》示例迁移 |
| 删除语义     | 删除书籍时异步清理源文件、章节、向量、助手、书籍会话与书籍记忆       |

---

## 4. MVP 范围

### 4.1 P0：必须完成

- 私人书架列表与空状态。
- EPUB/TXT 上传、大小与格式校验。
- 异步解析、分章、分块、Embedding 和 Milvus 入库。
- 处理状态与失败重试。
- 每本书自动生成一个默认助手。
- 新建、查看和删除书籍会话。
- 仅检索当前用户当前书籍。
- 回答附章节引用。
- 阅读状态：未开始、读到某章、已读完。
- 默认防剧透与单次“允许查看后文”。
- 删除书籍和其衍生数据。
- 从固定角色 UI 迁移到书架/书籍工作区。

### 4.2 P1：MVP 稳定后

- 助手名称、回答深度、语气与自定义指令。
- EPUB 封面提取。
- 章节摘要、人物卡片与书内搜索。
- 用户笔记与引用收藏。
- 索引版本升级与后台重建。

### 4.3 非目标

- 用户之间分享上传内容或助手。
- 公共书库、Agent 商店、排行榜。
- 自动生成多个角色 Agent。
- 跨书对比或联合世界观问答。
- OCR、扫描件、复杂 PDF 版式解析。
- 在 BookSoul 内完成整本书的排版阅读。
- 替代专业文学研究或版权合规审查。

---

## 5. 信息架构与页面

### 5.1 顶层结构

```text
BookSoul
├─ 我的书架
│  ├─ 上传小说
│  ├─ 处理中
│  └─ 已可用
├─ 书籍工作区
│  ├─ 对话
│  ├─ 目录与阅读进度
│  └─ 助手设置
└─ 账号设置
```

### 5.2 我的书架

书籍卡片展示：

- 封面或默认书封。
- 书名、作者（若可识别）。
- 状态：等待处理、解析中、建立索引、可对话、失败、删除中。
- 进度：例如“已读至第 18 章”或“允许全书剧透”。
- 最近对话时间。
- 失败时显示可理解的原因与“重试”操作。

空状态的唯一主操作是“上传第一本小说”，可以保留《天龙八部》系统示例作为低门槛体验，但必须明确标注“示例书”。

### 5.3 上传流程

1. 选择或拖入文件。
2. 客户端预检扩展名和大小。
3. 服务端验证并保存为不可公开访问的内部文件。
4. 返回书籍卡片，状态为 `QUEUED`。
5. 前端轮询状态，展示当前阶段和百分比。
6. 索引成功后要求用户选择阅读状态。
7. 自动进入该书助手或留在书架。

上传请求只负责可靠接收文件，响应使用 `202 Accepted`；解析与 Embedding 不占用该 HTTP 请求生命周期。

### 5.4 书籍工作区

桌面端建议保留当前对话页结构，但侧栏从“角色切换”变成：

- 返回书架。
- 当前书籍信息与处理状态。
- 新对话。
- 当前书籍的历史会话。
- 阅读进度入口。
- 助手设置。

用户登录后进入书籍工作区时默认展示新对话；历史会话只在用户主动选择后加载，不自动恢复最近一次对话。

聊天空状态显示与当前书籍相关的动态建议，例如：

- “帮我总结已读章节的重要事件。”
- “目前出场的人物之间是什么关系？”
- “解释这一章中反复出现的意象。”
- 已读完时增加“全书有哪些早期伏笔？”

### 5.5 防剧透交互

用户第一次进入可对话状态时必须选择：

| 选择                | 系统行为                                                  |
| ------------------- | --------------------------------------------------------- |
| 尚未开始            | 默认只允许第 1 个正文 section；回答限于作品简介与开篇信息 |
| 正在阅读            | 用户选择当前章节；检索只允许该章及之前内容                |
| 已读完 / 不介意剧透 | 允许检索全书                                              |

当问题可能需要后文信息、但当前范围内没有证据时，助手回答：

> 在你当前读到的范围内还无法确认。要仅本次查看后续内容吗？

“仅本次允许剧透”是消息级覆盖，不修改长期阅读进度；界面必须明确标注本次回答可能包含后文。

---

## 6. 领域模型

### 6.1 关系概览

```text
User
 ├─ Book (PRIVATE，用户拥有源文件与语料)
 ├─ BookAssistant (用户在某本书上的私人助手配置)
 │   ├─ ReadingProgress
 │   └─ ChatSession
 │       └─ Messages (一期继续存 JSON)
 └─ Book-scoped Memory

Book
 ├─ BookSection
 │   └─ BookChunk
 └─ IngestionJob
```

`SYSTEM` 示例书没有普通用户 owner，但每位用户仍拥有自己独立的 `BookAssistant`、阅读进度、会话和记忆。普通用户上传的 `PRIVATE` 书籍只能由 owner 创建助手。

### 6.2 `Book`

| 字段                          | 类型                                                                        | 说明                                |
| ----------------------------- | --------------------------------------------------------------------------- | ----------------------------------- |
| `id`                          | UUID                                                                        | 书籍与向量过滤的稳定标识            |
| `ownerId`                     | UUID?                                                                       | 私有书籍必填；系统示例为空          |
| `visibility`                  | `PRIVATE \| SYSTEM`                                                         | 一期没有 PUBLIC                     |
| `title`                       | String                                                                      | EPUB 元数据、TXT 文件名或用户修改值 |
| `author`                      | String?                                                                     | 可选元数据                          |
| `originalFileName`            | String                                                                      | 仅展示；绝不作为磁盘路径            |
| `storageKey`                  | String                                                                      | 服务端生成的内部路径键              |
| `mimeType`                    | String                                                                      | 服务端探测结果                      |
| `fileSizeBytes`               | BigInt                                                                      | 配额与校验                          |
| `contentHash`                 | String                                                                      | SHA-256；用于同一用户内重复上传提示 |
| `language`                    | String?                                                                     | 可选                                |
| `coverStorageKey`             | String?                                                                     | 可选封面                            |
| `status`                      | `QUEUED \| PARSING \| CHUNKING \| EMBEDDING \| READY \| FAILED \| DELETING` | 生命周期                            |
| `statusProgress`              | Int                                                                         | 0～100，仅用于 UI                   |
| `failureCode`                 | String?                                                                     | 稳定错误码                          |
| `failureMessage`              | String?                                                                     | 对用户安全的错误信息                |
| `sectionCount`                | Int                                                                         | section 总数                        |
| `chunkCount`                  | Int                                                                         | chunk 总数                          |
| `parserVersion`               | String                                                                      | 支持重建                            |
| `embeddingVersion`            | String                                                                      | 模型、维度和分块策略版本            |
| `createdAt/updatedAt/readyAt` | DateTime                                                                    | 生命周期时间                        |

约束与索引：

- `@@index([ownerId, updatedAt])`
- `@@index([status, updatedAt])`
- 同一用户上传相同 hash 时提示已有书籍；一期不跨用户去重，也不共享私有语料。

### 6.3 `BookSection`

小说的“章节”在不同文件中并不统一，因此底层命名使用 `Section`：

| 字段        | 类型    | 说明                             |
| ----------- | ------- | -------------------------------- |
| `id`        | UUID    | 稳定 section 标识                |
| `bookId`    | UUID    | 所属书籍                         |
| `order`     | Int     | 从 1 开始，防剧透过滤依据        |
| `title`     | String  | 识别出的章节名或“第 N 节”        |
| `sourceRef` | String? | EPUB spine/href 等内部定位       |
| `content`   | Text    | 规范化纯文本，作为可重建的事实源 |
| `charCount` | Int     | 质量与进度统计                   |

约束：`@@unique([bookId, order])`。

### 6.4 `BookChunk`

| 字段                    | 类型   | 说明                 |
| ----------------------- | ------ | -------------------- |
| `id`                    | UUID   | 同时作为 Milvus 主键 |
| `bookId`                | UUID   | 所属书籍             |
| `sectionId`             | UUID   | 所属 section         |
| `sectionOrder`          | Int    | 冗余，便于筛选与重建 |
| `chunkIndex`            | Int    | section 内顺序       |
| `content`               | Text   | 检索后用于生成和引用 |
| `startOffset/endOffset` | Int?   | section 文本范围     |
| `embeddingVersion`      | String | 向量版本             |

Milvus 只保存向量和过滤字段；搜索返回 chunk id，再从 PostgreSQL 批量取 `BookChunk.content`。PostgreSQL 是正文与引用的事实源，Milvus 可随时重建。

### 6.5 `BookAssistant`

| 字段                  | 类型                            | 说明                           |
| --------------------- | ------------------------------- | ------------------------------ |
| `id`                  | UUID                            | 私人助手标识                   |
| `ownerId`             | UUID                            | 助手所属用户                   |
| `bookId`              | UUID                            | 助手只能绑定一本书             |
| `name`                | String                          | 默认“《书名》阅读助手”         |
| `responseDepth`       | `BRIEF \| BALANCED \| DEEP`     | 默认 BALANCED                  |
| `tone`                | `NATURAL \| WARM \| ANALYTICAL` | 默认 NATURAL                   |
| `customInstruction`   | String?                         | 最大 1000 字；低于系统安全规则 |
| `createdAt/updatedAt` | DateTime                        |                                |

约束：`@@unique([ownerId, bookId])`。一期不允许同一用户为同一本书创建多个助手。

### 6.6 `ReadingProgress`

| 字段                  | 类型                                     | 说明               |
| --------------------- | ---------------------------------------- | ------------------ |
| `ownerId + bookId`    | 复合唯一键                               | 用户在该书上的进度 |
| `mode`                | `NOT_STARTED \| IN_PROGRESS \| FINISHED` | 阅读状态           |
| `currentSectionOrder` | Int?                                     | `IN_PROGRESS` 必填 |
| `updatedAt`           | DateTime                                 |                    |

服务端计算 `spoilerCeiling`：

- `NOT_STARTED` → `1`
- `IN_PROGRESS` → `currentSectionOrder`
- `FINISHED` → `Book.sectionCount`

### 6.7 `IngestionJob`

| 字段                   | 类型                                       | 说明                           |
| ---------------------- | ------------------------------------------ | ------------------------------ |
| `id`                   | UUID                                       | 任务 id                        |
| `bookId`               | UUID                                       | 一书同一时刻只允许一个活跃任务 |
| `status`               | `QUEUED \| RUNNING \| SUCCEEDED \| FAILED` | 任务状态                       |
| `attempt`              | Int                                        | 重试次数                       |
| `lockedAt/heartbeatAt` | DateTime?                                  | 崩溃恢复                       |
| `lastError`            | String?                                    | 内部诊断信息，不直接返回前端   |
| `createdAt/updatedAt`  | DateTime                                   |                                |

一期采用 PostgreSQL 持久化任务 + NestJS 单实例有界 worker，不引入 Redis。worker 每次原子领取一个任务，定期写 heartbeat；服务重启后可回收超时任务。水平扩展或高并发上传时再替换为 BullMQ/专用队列，领域接口不变。

### 6.8 `ChatSessionRecord` 改造

现有复合主键 `ownerId + sessionId` 保留兼容，但新增：

- `bookAssistantId`：必填（迁移期可为空）。
- `title`：服务端生成或从首条消息提取。
- `messages`：一期继续使用 JSON，消息中不再以 `characterId` 作为身份依据。

新会话 id 必须由服务端生成 UUID。聊天接口只接收 `sessionId`，服务端依次验证：

```text
session.ownerId == 当前用户
session.bookAssistant.ownerId == 当前用户
assistant.book.status == READY
```

### 6.9 记忆作用域

记忆被明确分为：

| 类型         | 作用域                | 示例                         |
| ------------ | --------------------- | ---------------------------- |
| 全局用户偏好 | User                  | “喜欢简洁回答”               |
| 书籍阅读状态 | User + Book           | 当前章节、关注人物           |
| 会话记忆     | User + Book + Session | 本次讨论过哪些问题           |
| 小说事实     | BookSection/BookChunk | 只能来自原文，不写进用户事实 |

`MemoryRecord` 增加可空 `bookId`；会话型和书籍型记忆必须写 `bookId`。构建 Agent 上下文时只能加载全局偏好与当前 `bookId` 的记忆，不允许跨书召回剧情、人物和会话摘要。

---

## 7. 文件上传与解析

### 7.1 支持范围与默认限制

| 项                | 默认值                                |
| ----------------- | ------------------------------------- |
| 格式              | `.epub`、`.txt`                       |
| 单文件大小        | 50 MB，可配置                         |
| TXT 编码          | UTF-8、带 BOM UTF-8、GB18030 自动探测 |
| 单用户处理中任务  | 最多 2 个                             |
| 单用户书籍数量    | 开发期 20 本，可配置                  |
| EPUB 解压后总大小 | 100 MB，可配置                        |

必须同时校验扩展名、MIME/文件签名和解析结果，不能只相信客户端 `Content-Type`。

### 7.2 存储

一期使用配置项 `BOOK_UPLOAD_DIR` 指向非静态资源目录：

```text
{BOOK_UPLOAD_DIR}/private/{ownerId}/{bookId}/source.{ext}
{BOOK_UPLOAD_DIR}/private/{ownerId}/{bookId}/cover.{ext}
```

- `ownerId`、`bookId` 必须来自已校验的服务端值。
- 绝不拼接用户原始文件名。
- 原文件不通过 Nest static 或 Web 服务器公开。
- 下载/查看封面必须经过鉴权接口。
- 未来迁移到对象存储时仅替换 storage adapter。

### 7.3 EPUB 安全要求

- 限制 zip entry 数量、单 entry 大小和总解压大小，防止 zip bomb。
- 拒绝绝对路径和包含 `..` 的 entry。
- 忽略脚本、样式、iframe 和外部资源。
- 只按 EPUB spine 顺序提取正文。
- 图片一期只尝试提取封面，不做 OCR。

### 7.4 分章策略

EPUB：

1. 优先读取 navigation/NCX 与 spine。
2. 使用章节标题与 spine 顺序生成 section。
3. 过短且连续的前言/版权页可合并，但不可改变正文顺序。

TXT：

1. 识别常见中文章节标题（如“第十二章”“卷三”）与 `Chapter N`。
2. 未识别到可靠章节时按段落和长度建立“第 N 节”。
3. 不因标题识别失败而阻止索引，但必须在 UI 标明目录为自动分节。

### 7.5 分块策略

- 先按 section，再按段落递归切分。
- 默认目标 800 个字符，overlap 120，可配置并写入 `embeddingVersion`。
- 不跨 section 合并 chunk。
- 保留 section order、chunk index 和文本 offset。
- 空白、导航目录、版权噪声和重复页眉先清理。

---

## 8. 异步索引流程

### 8.1 状态机

```text
POST /books
    ↓
QUEUED
    ↓ worker claim
PARSING
    ↓
CHUNKING
    ↓
EMBEDDING
    ↓
READY

任一阶段失败 → FAILED → 用户重试 → QUEUED
用户删除 → DELETING → 清理完成后删除 Book 记录
```

### 8.2 处理步骤

1. 验证任务与书籍仍存在且 owner 未变。
2. 解析元数据与 section，事务写入 `BookSection`。
3. 生成 chunk，事务写入 `BookChunk`。
4. 按小批量请求 Embedding，限制并发并指数退避。
5. 分批写入 Milvus。
6. 校验 PostgreSQL chunk 数与 Milvus 已写数量。
7. 更新 `Book.status = READY` 并自动创建 `BookAssistant`。

处理必须幂等：重试同一个 `bookId + embeddingVersion` 时，先清理该版本的部分向量，再重建，不能产生重复 chunk。

### 8.3 进度计算

前端展示的是阶段进度，不承诺精确剩余时间：

- `PARSING`：5～20%
- `CHUNKING`：20～30%
- `EMBEDDING`：30～95%，按已完成 chunk 比例
- 校验与加载：95～99%
- `READY`：100%

### 8.4 失败码

至少提供以下稳定错误码：

- `UNSUPPORTED_FORMAT`
- `FILE_TOO_LARGE`
- `INVALID_EPUB`
- `UNSAFE_ARCHIVE`
- `TEXT_ENCODING_UNSUPPORTED`
- `EMPTY_CONTENT`
- `SECTION_LIMIT_EXCEEDED`
- `EMBEDDING_UNAVAILABLE`
- `VECTOR_STORE_UNAVAILABLE`
- `INTERNAL_PROCESSING_ERROR`

对用户显示可执行的提示；内部堆栈只进日志。

---

## 9. Milvus 与检索隔离

### 9.1 新 collection

不要直接复用当前缺少 owner 过滤的 `ebook` schema。建立版本化 collection，例如 `book_chunks_v2`：

| 字段                | 类型        | 说明                                     |
| ------------------- | ----------- | ---------------------------------------- |
| `id`                | VarChar PK  | `BookChunk.id`                           |
| `owner_scope`       | VarChar     | 私有书 owner UUID；系统书为 `__system__` |
| `book_id`           | VarChar     | `Book.id`                                |
| `section_id`        | VarChar     | `BookSection.id`                         |
| `section_order`     | Int32       | 防剧透过滤                               |
| `chunk_index`       | Int32       | 稳定排序                                 |
| `embedding_version` | VarChar     | 重建与灰度                               |
| `vector`            | FloatVector | 维度由配置决定                           |

正文不再以 Milvus 为唯一副本。

### 9.2 检索过滤

服务端先从 session 反查 book，不接受客户端直接指定 `owner_scope`。私有书限制模式下的过滤等价于：

```text
owner_scope == "{authenticatedUserId}"
AND book_id == "{session.bookAssistant.bookId}"
AND section_order <= {spoilerCeiling}
AND embedding_version == "{activeVersion}"
```

系统示例书使用 `owner_scope == "__system__"`，但仍要求当前用户拥有该书的 `BookAssistant`。

所有用于构造 Milvus filter 的值必须来自 UUID/枚举等服务端校验值，禁止原样拼接自由文本。

### 9.3 检索结果

1. Milvus 返回 chunk ids 与 score。
2. PostgreSQL 使用 `WHERE id IN (...) AND bookId = expectedBookId` 再做一次校验并取正文。
3. 按向量 score 排序、去重相邻重叠片段。
4. 生成引用 `{ bookId, sectionId, sectionOrder, sectionTitle, chunkId, excerpt }`。
5. 任一引用的 `sectionOrder` 超过 spoiler ceiling 时整个回答失败关闭，不允许“只隐藏引用但保留答案”。

### 9.4 对话 Context 获取

Context 不固定塞入同样数量的历史、原文和记忆，而采用“确定性快速路由 + 条件式结构化 Planner + 确定性执行器”：

1. 服务端先解析 owner、book、embedding version 和 spoiler ceiling。Planner 不能生成或修改权限、过滤条件、阅读进度和数值预算。
2. 明确问候不调用 Embedding 和向量检索；单点事实题直接执行单查询 RAG。只有复杂分析和具有指代的追问才调用结构化 Planner 模型。
3. Planner 最多生成 3 条互补检索词，只读取当前问题、书名和最近两条用户问题，不把模型历史回答反哺给事实检索。Planner 超时、取消以外的错误或非法输出统一回到当前问题的标准 RAG，不降级为无原文回答。
4. 单点事实题最多取 4 个 chunk，普通问题最多 6 个，比较、关系、原因、总结等宽问题最多 8 个；宽问题限制同一章节占用，避免 Context 被单章垄断。
5. 多查询结果使用确定性融合后，再执行 owner、book、embedding version、spoiler ceiling 的 Milvus 过滤和 PostgreSQL 二次校验，并去重相邻重叠片段。
6. 普通历史最多保留 4 条、合计 6000 字符；追问最多保留 8 条、合计 12000 字符。原文 Context 按问题类型限制为 3600、5400 或 7200 字符。裁剪只影响本次模型上下文，不修改持久化历史和原文。
7. 只有问题明确涉及用户偏好或当前书笔记时才加载记忆：全局偏好最多 3 条，当前书笔记与全局偏好合计最多 5 条。记忆不能作为小说事实依据。

### 9.5 受控联网资料

1. 联网资料只用于现实背景、作者信息、历史典故和用户明确要求的网络查证，不代替书内 RAG。
2. 只有用户在单次提问中显式开启 `externalResearch` 才允许调用；模型、小说正文、检索片段、记忆和历史消息都不能触发。
3. 外部请求只包含当前问题和必要书名，不发送小说正文、用户记忆、会话历史、owner、book id 或其他账号信息。
4. 一期仅允许 Tavily `tavily_search`，限制为 5 条结果、basic 深度、不含图像和网页全文；输入、输出、超时和 URL 协议由服务端确定性校验。
5. 外部结果以不可信资料分区注入 Prompt，不能当作指令或小说事实。回答引用外部资料时必须附 URL，并与书内章节引用分开展示。
6. MCP 失败必须显式告知用户；只要书内 RAG 仍可用，本轮可继续基于当前可见原文回答，但不得伪装已经联网。

---

## 10. 防剧透设计

### 10.1 服务端规则

防剧透需要同时覆盖四层：

1. **检索层：** Milvus 过滤 `section_order <= ceiling`。
2. **数据层：** PostgreSQL hydrate 再检查 section order。
3. **生成层：** restricted 模式要求只依据提供片段回答，不使用模型对该作品的先验知识补全后文。
4. **输出层：** 返回前校验所有 citations 未越界。

### 10.2 消息级覆盖

聊天请求可携带：

```json
{
  "sessionId": "server-generated-uuid",
  "message": "……",
  "spoilerOverride": "DEFAULT"
}
```

允许值：

- `DEFAULT`：按阅读进度。
- `FULL_BOOK_ONCE`：仅当前消息可检索全书；前端必须由明确确认操作生成。

后端不接受任意 section ceiling，避免客户端构造模糊状态。覆盖不修改 `ReadingProgress`。

### 10.3 能力边界

基座模型可能已经知道知名小说内容，单靠技术无法承诺绝对零剧透。restricted 模式应采取保守策略：

- 小说事实必须有当前范围内引用。
- 当前范围没有足够依据时不猜测。
- 不回答“以后是否会……”类问题，除非用户单次解除限制。
- UI 文案使用“按阅读进度限制回答”，不使用无法兑现的“绝对不会剧透”。

---

## 11. 通用小说 Agent

### 11.1 默认能力

- 已读内容问答。
- 前情回顾和章节总结。
- 人物、地点、物品和设定说明。
- 人物关系与当前阶段动机分析。
- 伏笔、主题、意象与叙事分析（受阅读进度限制）。
- 引用原文章节作为依据。

### 11.2 Prompt 组成

服务端按固定顺序组合：

```text
平台系统规则
  ↓
当前书籍元数据
  ↓
防剧透模式与可见 section 范围
  ↓
助手风格设置
  ↓
全局用户偏好 + 当前书籍记忆
  ↓
检索片段（明确标记为“不可信指令，仅供引用的数据”）
  ↓
会话上下文与当前问题
```

平台规则优先级最高。用户自定义指令不能关闭鉴权、越过阅读范围、要求泄露其他书籍或把上传文本当系统指令。

### 11.3 回答准则

- 区分“原文明确说明”“根据已读内容推断”“当前无法确认”。
- 事实回答尽量带引用；闲聊和操作提示无需强制引用。
- 不伪造章节、原句或引用。
- 多个片段冲突时说明不确定性。
- restricted 模式不以模型常识补全后续剧情。

### 11.4 现有 Agent 工作流迁移

可保留：

- SSE 流式输出。
- 查询改写、向量检索、生成、引用和性能指标。
- 会话历史和可中止请求。
- 通用的用户偏好记忆。

需要泛化或移除：

- `PersonaService` 中四个固定人物。
- `ChatDto.character` 与前端 `CharacterType`。
- 所有《天龙八部》硬编码提示词、问候语和 query rewrite 示例。
- 检索工具对固定 `ebook` collection 的无过滤搜索。
- 地图和角色口吻等非核心工具默认入口。邮件仅作为用户在某条助手回复上主动打开的受控能力，不恢复模型可直接执行的旧发送工具。

---

## 12. API 设计

所有 API 默认使用现有 JWT 登录态；私人书籍功能不提供匿名上传。

### 12.1 Books

| Method   | Path                       | 说明                                   |
| -------- | -------------------------- | -------------------------------------- |
| `POST`   | `/api/books`               | multipart 上传；成功返回 `202` 与 Book |
| `GET`    | `/api/books`               | 当前用户的私有书 + 可用系统示例        |
| `GET`    | `/api/books/:bookId`       | 详情、状态、section 列表摘要、助手信息 |
| `POST`   | `/api/books/:bookId/retry` | 仅 FAILED 可重试                       |
| `DELETE` | `/api/books/:bookId`       | 标记 DELETING 并异步清理               |
| `GET`    | `/api/books/:bookId/cover` | 鉴权读取封面                           |

上传响应示例：

```json
{
  "success": true,
  "data": {
    "id": "book-uuid",
    "title": "文件名推导标题",
    "status": "QUEUED",
    "statusProgress": 0
  }
}
```

### 12.2 阅读进度与助手

| Method  | Path                                  | 说明                             |
| ------- | ------------------------------------- | -------------------------------- |
| `GET`   | `/api/books/:bookId/sections`         | section 目录，不返回整章正文     |
| `PUT`   | `/api/books/:bookId/reading-progress` | 设置状态和当前 section           |
| `GET`   | `/api/books/:bookId/assistant`        | 获取当前用户的助手               |
| `PATCH` | `/api/books/:bookId/assistant`        | 修改名称、深度、语气、自定义指令 |

进度更新示例：

```json
{
  "mode": "IN_PROGRESS",
  "currentSectionOrder": 18
}
```

服务端验证 section 18 确实属于该书且在合法范围内。

### 12.3 Sessions 与 Chat

| Method   | Path                           | 说明                                                                       |
| -------- | ------------------------------ | -------------------------------------------------------------------------- |
| `POST`   | `/api/books/:bookId/sessions`  | 为当前书助手创建服务端 UUID 会话                                           |
| `GET`    | `/api/books/:bookId/sessions`  | 只列当前书的会话                                                           |
| `GET`    | `/api/chat/history/:sessionId` | 校验 owner 后读取消息                                                      |
| `DELETE` | `/api/chat/history/:sessionId` | 校验 owner 后删除                                                          |
| `POST`   | `/api/chat`                    | SSE；body 只含 sessionId、message、spoilerOverride 和单次 externalResearch |

现有 `/api/chat/history` 全局列表可在迁移期保留，最终书架侧只展示按 book scoped 的会话。

### 12.4 邮件工具

| Method | Path               | 说明                                           |
| ------ | ------------------ | ---------------------------------------------- |
| `POST` | `/api/tools/email` | JWT 用户在可编辑草稿中明确确认后发送纯文本邮件 |

客户端只能从已完成的助手回复打开邮件草稿，默认收件人为当前登录账号邮箱。请求必须携带 `confirmed: true`，并受服务端长度校验、邮箱校验、独立限流和 SMTP 超时约束。不接受 HTML，不在日志中记录收件人、正文或服务商错误详情。

### 12.5 状态轮询

一期由书架每 2～4 秒轮询仍在处理的 Book；页面隐藏后降低频率。状态达到 `READY` 或 `FAILED` 后停止。不为上传进度另建 WebSocket。

---

## 13. 权限、隐私与安全

### 13.1 授权规则

- `PRIVATE Book.ownerId` 必须等于 JWT `sub`。
- `BookAssistant.ownerId`、`ChatSessionRecord.ownerId` 必须等于 JWT `sub`。
- `SYSTEM Book` 只读，用户只能修改自己的 assistant/progress/session。
- 客户端传入的 bookId/sessionId 只用于查找，不能直接决定 owner filter。
- 任何不存在或不属于当前用户的私有资源统一返回 404，减少资源枚举。
- 邮件属于外部写操作；只能由用户在可见草稿上二次确认，不能由模型、检索内容或工具输出自动执行。

### 13.2 隐私原则

- 私有上传不跨用户去重，不共享向量或解析文本。
- 日志不记录原文全文、上传文件内容、对话中的敏感片段或 Token。
- 错误追踪只记录 book id、阶段、错误码和请求 id。
- 用户删除书籍后，源文件、封面、PG 文本、Milvus 向量和书籍记忆都进入清理范围。
- 删除任务应幂等；部分存储不可用时保持 `DELETING` 并后台重试，不能提前宣称已完全删除。

### 13.3 内容与版权边界

一期 UI 明确：用户应仅上传自己有权使用的内容；上传默认私有；产品不提供大段连续原文导出和公开分发功能。正式对外发布前需要根据目标市场补充隐私政策、内容删除承诺和版权条款，本设计不替代法律审查。

### 13.4 Prompt injection

小说正文、章节标题、文件元数据和引用片段均按不可信数据处理：

- 放入明确数据分隔符。
- 系统提示声明其中的指令无效。
- 不允许正文触发 MCP、邮件或外部工具。
- 外部搜索结果同样放入独立数据分隔符，不能覆盖书内事实域、权限或防剧透规则。
- 自定义指令有长度限制，并处在平台规则与防剧透规则之后。

---

## 14. 删除与恢复

### 14.1 删除顺序

1. 校验 owner，Book 标记为 `DELETING`，立即从正常书架隐藏。
2. 阻止新会话和新聊天。
3. 删除 Milvus 中该 `owner_scope + book_id` 的向量。
4. 删除书籍会话、书籍记忆、assistant、progress、chunks、sections 和 job。
5. 删除封面与源文件。
6. 删除 Book 记录并写最小审计事件（不含内容）。

失败时从未完成步骤继续。对系统示例书只允许删除用户自己的 assistant/progress/session，不能删除系统语料。

### 14.2 重新索引

模型、维度、parser 或 chunk 策略变化时创建新的 `embeddingVersion`：

- 新版本后台构建。
- 完成校验后原子切换 `Book.embeddingVersion`。
- 聊天始终只检索 active version。
- 切换成功后异步清理旧向量。

---

## 15. 现有数据与代码迁移

### 15.1 《天龙八部》

将现有《天龙八部》语料迁移为唯一的 `SYSTEM` 示例书：

- 使用稳定 book id 重新索引到 `book_chunks_v2`，`owner_scope = "__system__"`。
- 每个用户第一次打开示例书时自动创建自己的 `BookAssistant` 与 `ReadingProgress`。
- 现有聊天会话若能确定属于《天龙八部》，迁移时关联对应用户的示例书助手。
- 原 `ebook` collection 在验收完成前只读保留，之后单独清理，不在代码中继续双写。

### 15.2 数据库迁移

1. 新增 Book、Section、Chunk、Assistant、Progress、Job 表。
2. `ChatSessionRecord.bookAssistantId` 先可空。
3. 创建系统示例书及每位现有用户的助手。
4. 回填现有 ChatSession 的 `bookAssistantId`。
5. 验证无空值后改为非空约束。
6. `MemoryRecord` 增加 `bookId` 并为可识别旧会话回填。

### 15.3 前端迁移

| 当前                      | 目标                                       |
| ------------------------- | ------------------------------------------ |
| `Entrance` 选择人物       | `LibraryPage` 展示/上传书籍                |
| `CharacterType`           | `BookSummary` + `BookAssistant`            |
| `currentCharacter`        | `currentBookId/currentSessionId`           |
| `switchCharacter`         | `openBook/createBookSession`               |
| 固定 greeting/suggestions | 按 Book 与进度动态生成                     |
| CharacterSwitchPanel      | Book switcher / 返回书架                   |
| 消息 `characterId`        | 可选 `assistantSnapshot`，不再决定后端行为 |

### 15.4 后端迁移

新增：

```text
server/src/books/**
server/src/ingestion/**
server/src/book-assistants/**
server/src/reading-progress/**
server/src/storage/**
```

改造：

- `AgentService.searchNovel` 接受由服务端解析出的 BookScope 和 spoiler ceiling。
- `ChatController` 不再接收 `character`。
- `PersonaService` 替换为 `BookAssistantPromptService`。
- `ingest.ts` 的解析/分块逻辑下沉为可测试服务，CLI 只作为调用入口。
- 所有 Agent node 移除《天龙八部》固定文案。
- `RagService` 与 AgentService 的重复人格/检索逻辑合并，避免两套路径行为不一致。

---

## 16. 可靠性、成本与可观测性

### 16.1 需要记录的指标

- 上传成功/失败率与错误码分布。
- 各解析阶段耗时。
- 每本书 section/chunk 数。
- Embedding 请求次数、token/字符量、重试次数与估算成本。
- 检索耗时、返回数量、空检索率。
- 聊天首 token 延迟、总耗时、取消率。
- 引用数量与越界校验失败次数。
- 删除任务完成时间和重试次数。

### 16.2 成本控制

- 上传前执行用户书籍数和文件大小配额。
- 同一用户相同 content hash 提示复用已有书，不重复索引。
- Embedding 批处理、限并发、指数退避。
- 失败重试从可恢复阶段开始，避免重复解析。
- 查询 embedding 缓存键必须包含 embedding version；检索结果缓存若引入，键必须包含 user、book、spoiler ceiling 与 query。
- 删除书籍同步释放向量与文本存储。

### 16.3 MVP 运行假设

- 后端一期按单实例 ingestion worker 设计。
- PostgreSQL、Milvus 与文件存储均为单环境可信服务。
- 不承诺海量并发上传；通过每用户和全局并发限制保护模型额度。
- worker 接口与任务表允许未来独立部署。

---

## 17. 测试与验收

### 17.1 产品验收

- [ ] 用户可以上传合法 EPUB/TXT，并在请求返回后持续看到处理状态。
- [ ] READY 后自动生成一个默认助手，无需填写复杂配置。
- [ ] 用户可在多本书之间切换，历史会话按书分组。
- [ ] 回答展示真实 section 标题与片段引用。
- [ ] 用户可设置未开始、当前章节或已读完。
- [ ] restricted 模式下引用和检索结果不超过当前章节。
- [ ] 用户可单次确认允许全书回答，且不改变长期进度。
- [ ] 用户可删除书籍，删除中不能继续聊天，最终所有衍生数据被清理。

### 17.2 隔离与安全测试

- [ ] 用户 A 无法读取用户 B 的 Book、状态、封面、目录、助手和会话。
- [ ] 用户 A 无法通过伪造 sessionId 让服务端检索用户 B 的向量。
- [ ] 两本包含同名人物的小说连续提问时，结果不会串书。
- [ ] Milvus 查询始终包含正确 owner scope、book id 和 embedding version。
- [ ] restricted 模式查询始终包含 section ceiling。
- [ ] 非法 EPUB 路径、zip bomb、超限文件和伪造扩展名被拒绝。
- [ ] 上传文本中的 Prompt injection 不能触发工具或改变系统规则。
- [ ] 删除接口不可删除系统示例语料或他人私有书籍。

### 17.3 可靠性测试

- [ ] 服务在 PARSING/EMBEDDING 中途重启后，任务可恢复或安全重试。
- [ ] Embedding 部分成功后重试不会生成重复 chunk/vector。
- [ ] Milvus 暂时不可用时 Book 进入可重试失败状态，不误标 READY。
- [ ] 删除中某个存储不可用时保持 DELETING，恢复后继续。
- [ ] 旧版本向量不会被 active book 检索。

### 17.4 现有能力回归

- [ ] JWT 用户隔离仍生效。
- [ ] SSE 内容、thinking、references、metrics 和停止生成仍可用。
- [ ] 会话列表、读取和删除仍按 owner 隔离。
- [ ] 记忆只加载全局偏好与当前书作用域。

---

## 18. 产品验证指标

MVP 不以“上传了多少文件”为成功，而以“上传后是否形成持续阅读对话”为准：

| 指标             | 定义                                             |
| ---------------- | ------------------------------------------------ |
| 上传可用率       | 合法文件最终 READY 的比例                        |
| 激活率           | READY 后 24 小时内至少完成一次有效提问的用户比例 |
| 首次价值时间     | 上传开始到第一次收到有引用回答的时间             |
| 每本活跃书消息数 | READY 书籍在 7 天内的用户消息数                  |
| 7 日回访率       | 用户是否回到同一本书继续对话或更新进度           |
| 空检索率         | 需要原文依据的问题中未找到有效 chunk 的比例      |
| 引用打开率       | 用户展开引用片段的比例                           |
| 剧透投诉率       | 用户主动标记“超出阅读进度”的回答比例，目标接近 0 |

最先验证的产品假设是：**用户会不会为了正在阅读的一本书，完成上传并在之后多次回来询问，而不仅是体验一次。**

---

## 19. 实施分期建议

| 阶段            | 交付内容                                                        |
| --------------- | --------------------------------------------------------------- |
| T1 · 领域底座   | Prisma 模型、Books API、私有文件存储、权限测试                  |
| T2 · 异步导入   | EPUB/TXT parser、section/chunk、持久化 job、状态与重试          |
| T3 · 向量隔离   | `book_chunks_v2`、批量 Embedding、owner/book/version 过滤、删除 |
| T4 · 通用 Agent | session → book scope、通用 Prompt、引用、去角色化、防剧透       |
| T5 · 前端闭环   | 私人书架、上传与进度、书籍工作区、按书历史、助手设置基础版      |
| T6 · 迁移与验收 | 《天龙八部》系统示例、旧会话回填、隔离/恢复/删除 E2E、README    |

每个阶段应能独立测试；不要先大面积重做 UI，再补书籍作用域和向量隔离。

---

## 20. 开放项与一期默认值

以下事项不阻塞实现，若无新的产品决策则采用默认值：

| 开放项                 | 一期默认                                   |
| ---------------------- | ------------------------------------------ |
| 最大上传大小           | 50 MB                                      |
| TXT 编码               | UTF-8 + GB18030 自动探测                   |
| 一本书能否创建多个助手 | 否                                         |
| 是否支持编辑书名/作者  | 支持元数据修改，不修改正文                 |
| 未选择阅读状态能否聊天 | 首次聊天前必须选择；默认不擅自开放全书     |
| 防剧透单次放行         | 支持 `FULL_BOOK_ONCE`，需要显式确认        |
| 私有内容跨用户去重     | 不做                                       |
| 处理任务队列           | PostgreSQL 持久化 + 单实例 worker          |
| 文件存储               | 本地私有目录 + adapter，后续可切对象存储   |
| 系统示例               | 保留《天龙八部》，只读且与私人上传明确区分 |
| 旧角色入口             | 移除；不在 MVP 中作为模式保留              |
| 完整阅读器             | 不做，只显示目录、进度和短引用             |

---

## 21. 成功定义

一期完成后，一个已登录用户可以上传两本不同小说，等待系统可靠完成索引，为每本书获得独立助手，设置各自阅读进度并进行有章节引用的对话；两本书、两个用户、不同阅读范围之间不存在检索、历史或记忆串线；用户删除一本书后，其源文件和全部衍生数据可以可靠清理。

达到这一状态，BookSoul 才算从“《天龙八部》角色聊天 Demo”真正升级为“私人小说阅读助手产品”。
