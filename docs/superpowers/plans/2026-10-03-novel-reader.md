# BookSoul Novel Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 默认在当前会话内执行；只有用户另行要求并行代理时才委派。

**Goal:** 首页点击图书进入“本书空间”，由该页提供阅读与聊天两个入口；复用全站背景、主题与封面，保留现有聊天模块，新增独立阅读模块，支持按需加载正文、连续阅读、自动续读、助手面板与引用回原文。

**Architecture:** BookOverview 提供同书阅读/聊天入口，复用全站外观；BookReader 直接读取 PostgreSQL 中规范化的 BookSection 正文，按有界文字窗口返回和展示，独立 BookReadingPosition 记录续读位置。新增 useReaderStore，保留 BookChat 原页面结构；阅读助手面板复用已有消息、输入组件和 useChatStore，引用通过服务端验证过的片段偏移定位。

**Tech Stack:** 现有 Node.js 22.19.x、npm 10、React 19、TypeScript、Zustand、NestJS 11、Prisma、Vitest/happy-dom、Jest；不新增生产依赖。

**Spec:** [章节阅读器设计](../specs/2026-10-03-novel-reader-design.md)。先读该规格及仓库 AGENTS.md，再执行下面步骤。本文件是实施前方案，不是已执行记录。

## Global Constraints

- 保留当前未提交工作；未经要求不创建分支、不提交、不 push、不开 PR。
- 新增阅读模块，不覆盖 BookChat；首页书卡按最新确认进入“本书空间”，再选择阅读或聊天。首页明确标为“继续对话”的快捷操作仍直接聊天。阅读器仍可展开助手面板。
- 本书空间复用 AppHeader/ScenicBackground/BookCover/useAppearanceStore，背景和明暗主题沿用全局选择，导航不重置外观；不创建另一套背景、封面或主题实现。
- 不修改 .env、现有密钥或部署配置，不启动 ingestion worker，不自动迁移真实数据库。
- PRIVATE 只允许 owner；SYSTEM 仍要求登录；续读位置始终以 owner/book 隔离。
- 保留 ReadingProgress 和章节级 spoilerCeiling；NOT_STARTED 仍允许第 1 节。
- 正文阅读、预加载、续读保存不得更新助手范围，不进入 Prompt、检索、外部搜索或记忆。
- 正文窗口默认 16000，limit 范围 1024—32000，偏移使用 UTF-16 code unit，DOM 与内存最多 3 个正文窗口。
- 阅读器代码、正文与助手历史按入口/窗口/面板分别按需加载；同作用域最多一个前台窗口请求和一个相邻预取，不下载全书或全部章节。
- 默认质量门不连数据库。数据库验证只运行 reader 专用命令，目标必须经现有隔离门禁证明安全；禁止无范围清理。
- 每个相关缺陷先有暴露失败条件的测试，再实现，再运行相关检查；本期不整理无关代码或放宽质量门。

## Review Focus

| 最易遗漏的输入或场景 | 预期 | 负责步骤 |
| --- | --- | --- |
| emoji、重复原句、没有换行的长段落 | 文字窗口无损，位置按偏移恢复，引用不猜匹配位置 | 1、4、5 |
| 快速切书、登出后旧请求完成 | 旧正文和保存响应不恢复新状态 | 3 |
| 多窗口和网络响应丢失 | CAS 拒绝旧版本，不盲目重试覆盖 | 2、3 |
| 引用预览、自动恢复、字号重排触发 scroll | 不改续读位置或助手范围 | 3、4、5 |
| 已删除、正在删除、已重建的章节或片段 | 拒绝读取或明确无法精确定位，不泄漏、不伪造 | 1、2、5 |

## 0. 开工前检查与基线

- [ ] 读取 git status、相关 diff 与最近适用的 AGENTS；记录本次起始文件集合。当前大量文件已修改，禁止用清空工作区或全仓格式化换取干净基线。
- [ ] 核对 `node --version` 和 `npm --version`；要求 Node 22.19.x/npm 10。依赖缺失按既有 npm 工作流安装，不添加替代包管理器。
- [ ] 核对 client/server package.json、默认 Jest 发现范围、测试环境加载路径及会访问真实服务的测试。只读查看相关配置，不输出 .env 或凭据。
- [ ] 在 server 执行 `node node_modules/jest/bin/jest.js --listTests --runInBand`，确认 `.db.spec.ts` 与真实 Prisma 连接测试未被默认发现；还需核对发现的测试使用 mock，不靠文件名证明安全。
- [ ] 安全门禁通过后，分别运行两包现有 `npm run check`，记录退出码与已存在的失败。门禁无法证明安全则不运行全量检查，记录阻塞原因；先做确定不连库的相关单测。

基线失败时，不修复无关认证、主题或其他用户改动。交付时区分原有失败和本次引入的失败。

## 1. 受保护的正文窗口和引用位置接口

**Files**

- 新建：`server/src/books/book-reader.types.ts`、`book-reader.service.ts`、`book-reader.controller.ts`、`dto/read-section-window.dto.ts`。
- 修改：`server/src/books/books.module.ts`，注册新控制器和服务。
- 测试：`server/src/books/book-reader.service.spec.ts`、`book-reader.controller.spec.ts`。

**Interfaces**

- `getSectionWindow(ownerId: string, bookId: string, sectionId: string, query: {offset?: number; limit?: number}): Promise<SectionWindow>`。
- `getReferenceLocation(ownerId: string, bookId: string, chunkId: string): Promise<ReferenceLocation>`。
- `ReferenceLocation = {bookId, sectionId, sectionOrder, contentHash, startOffset, endOffset, precision: "excerpt" | "section"}`；字段类型按规格第 5 节。
- 控制器输出既有 success envelope；旧目录接口、ChatDto 和 SSE 均不变化。

- [ ] 写 service 失败用例：owner 条件出现在 book 查询；section/chunk 查询包含 bookId、READY 条件；片段查询包含 active version。跨用户私书、跨书 section/chunk 返回 404，非 READY 返回 409，且不查询无作用域正文。
- [ ] 写窗口用例：`text === fullText.slice(startOffset,endOffset)`、相邻窗口拼接等于原文、默认 16000/上限 32000、负数/浮点/超过正文范围返回 400、在 emoji 中间请求仍保持完整代理对。
- [ ] 写引用用例：重复句按 chunk offset 定位；offset 为 null 或与正文不一致时 precision 为 section；旧 embedding version 返回 404。高亮片段开头至多 600 code unit。
- [ ] 写 controller 用例：未认证 401；PRIVATE 与 SYSTEM 都经过 JWT；成功响应含 `Cache-Control: private, no-store`；目录仍不返回正文。TestingModule 使用 mock 服务/Prisma，不能导入完整 AppModule。
- [ ] 运行失败测试：`npm test -- --runInBand book-reader.service.spec.ts book-reader.controller.spec.ts`。预期新增行为未实现导致失败，而非数据库或模块加载失败。
- [ ] 实现上述签名、DTO 和状态/归属查询；使用 Node crypto 计算规范化整节 hash，用文本 slice 构造窗口，不读取源上传文件、不调用向量库或模型。
- [ ] 重跑相同命令，再运行 `npm test -- --runInBand book-reading.service.spec.ts reading-progress.policy.spec.ts`。通过标准：全部退出码 0，旧章节级范围不变。

**可审阅交付：** 正文和位置 API 的请求/响应样例、权限查询断言以及相关 Jest 结果。

## 2. 独立续读位置与数据库 CAS

**Files**

- 修改：`server/prisma/schema.prisma`，新增 BookReadingPosition 及 User/Book/BookSection 关系；保留现有修改。
- 新建：`server/prisma/migrations/20261003090000_book_reading_position/migration.sql`。
- 新建：`server/src/books/book-reader-position.service.ts`、`dto/update-reader-position.dto.ts`。
- 修改：`book-reader.types.ts`、`book-reader.controller.ts`、`books.module.ts`，补充位置契约。
- 测试：`server/src/books/book-reader-position.service.spec.ts`、`book-reader-position.db.spec.ts`。
- 新建：`server/test/jest-reader-db.json`、`server/test/support/reader-db-fixture.ts`。
- 修改：`server/package.json`，只增加 `test:db:reader` 脚本，不改默认 test/check 或既有 auth 数据库配置。

**Interfaces**

```typescript
interface ReaderPosition {
  bookId: string;
  sectionId: string;
  offset: number;
  contentHash: string;
  revision: number;
  updatedAt: string;
  contentChanged: boolean;
}
interface SaveReaderPositionInput {
  sectionId: string;
  offset: number;
  contentHash: string;
  expectedRevision: number;
}
```

- `getPosition(ownerId: string, bookId: string): Promise<ReaderPosition | null>`，读取不创建记录。
- `savePosition(ownerId: string, bookId: string, input: SaveReaderPositionInput): Promise<ReaderPosition>`。
- 409 稳定错误码：`READER_POSITION_CONFLICT`、`READER_CONTENT_CHANGED`；不返回 owner 或正文。

- [ ] 写失败单测：首次 expectedRevision=0 创建 revision=1；后续条件更新包含 ownerId/bookId/revision，成功递增；更新 0 行或首次 P2002 返回冲突，绝不做无条件 upsert。
- [ ] 写拒绝单测：foreign section、负偏移、非安全整数、正文 hash 不一致、书籍非 READY；任何失败均无位置写入。读取 hash 已变化时只返回 contentChanged，不改旧记录。
- [ ] 运行 `npm test -- --runInBand book-reader-position.service.spec.ts`，确认新行为失败。
- [ ] 编写仅扩展 schema 的新迁移：复合主键 ownerId/bookId、三个有明确级联删除的外键、offset 非负/revision 正数约束；不补写或重置既有进度。
- [ ] 实现位置服务与 DTO。保存时重新验证授权、章节、hash，并在事务内采用条件更新/首次受唯一键约束的创建。版本匹配检查必须由数据库原子完成。
- [ ] 检查 schema/迁移内容后在 server 运行 `npm run prisma:generate`，确认该脚本只生成本地客户端、不部署迁移；生成物不提交。重跑位置单测和步骤 1 的 controller 单测。
- [ ] 为新增位置路由补充未登录、跨用户 GET/PUT、SYSTEM 用户独立位置的 controller 用例，并运行 `npm test -- --runInBand book-reader.controller.spec.ts`。
- [ ] 新建专用 reader DB Jest 配置：rootDir 为 ../src，只发现 books 目录中的 `.db.spec.ts`；脚本为 `jest --config ./test/jest-reader-db.json --runInBand`。fixture 创建 PrismaClient 前调用现有 `resolveIsolatedDatabaseUrl(process.env)`，不加载 .env，不 fallback。
- [ ] 写真实并发测试：两请求同时使用同一 expectedRevision，只有一个成功、另一个 409；首次并发创建同样只有一个成功；删除本次 fixture book/section 后无孤儿位置。创建资源都登记本次唯一 ID，cleanup 的查询含显式 ID allowlist。
- [ ] 用 `node node_modules/jest/bin/jest.js --listTests --runInBand` 重新核对默认发现范围，再运行相关单测。专用 DB 测试只在**显式配置、通过隔离门禁且已部署迁移**的测试库执行 `npm run test:db:reader`，通过标准为全部用例退出码 0；否则在验收记录中写明未运行。

**可审阅交付：** 新迁移 diff、CAS 查询条件、冲突响应及单测证据；真实 PostgreSQL 竞争和级联是否验证单独列明。

## 3. 客户端 API、保存队列与请求隔离

**Files**

- 新建：`client/src/lib/book-reader-api.ts`、`book-reader-api.test.ts`。
- 新建：`client/src/store/useReaderStore.ts`、`useReaderStore.test.ts`。
- 新建：`client/src/components/BookReader/useReaderWindows.ts`、`useReaderWindows.test.ts`，管理观察器、可视窗口、预取与占位高度；数据与请求仍归 reader store。
- 新建：`client/src/lib/book-workspace-navigation.ts`、`book-workspace-navigation.test.ts`，管理两个模块之间的显式导航与同书聊天初始化。
- 修改：`client/src/store/useBooksStore.ts`、`useBooksStore.test.ts`、`client/src/App.tsx`，接入 reader 状态清理。

**Interfaces**

- API：`getSectionWindow(bookId,sectionId,offset?,signal?)`、`getReferenceLocation(bookId,chunkId,signal?)`、`getReaderPosition(bookId,signal?)`、`saveReaderPosition(bookId,input,signal?)`。类型与步骤 1—2 的契约一致。
- 新请求设置 15 秒上限并传播 AbortSignal；响应先作为 unknown 检查类型和范围，不依赖泛型断言承诺合法。
- Store：`openReader(bookId)`、`previewSection(sectionId)`、`previewReference(reference)`、`returnToReading()`、`continueFromPreview()`、`recordVisibleOffset(offset)`、`retrySave()`、`clearPrivateState()`。
- 新增 `BooksView="book" | "reader"`；`openBook(bookId, target="workspace")` 保持内部默认兼容，首页书卡显式使用 target="book"，新增 `switchBookView("book" | "reader" | "workspace")`。首次进入 book 只准备元数据、续读位置和助手范围摘要，不准备聊天或正文。
- `ensureBookChat(bookId: string): Promise<void>` 放在新导航模块：当前 chatStore.currentBookId 为同书时保留状态；不同书时调用现有 prepareBook，并在完成后重新校验活动 owner/book/导航代次。reader 打开仅加载阅读所需数据；助手面板展开和进入聊天页才调用该函数。

- [ ] 写 API 失败用例：正确 path/envelope、signal 和 timeout；无效响应拒绝；409 保留稳定 code；模拟 401 走既有刷新机制，不新增持久 Token 或重放无关请求。
- [ ] 写 store 失败用例：A 书请求延迟，切到 B 后 A 完成不污染 B；clearPrivateState 后旧请求不能恢复正文；保存响应晚到不覆盖新书；等待中的队列属于固定 owner/book/代次。
- [ ] 写保存行为用例：正常用户滚动 1000ms 后只提交最新 offset；同书 PUT 串行；预览/自动恢复/排版重排不写；冲突不自动重试，明确“使用本窗口的位置”才使用读回的 revision 再保存。
- [ ] 写按需请求用例：首屏只加载所需窗口，临近边界才预取一邻窗；并发的同窗口触发只产生一个请求；请求完成后以 nextOffset 前进；缓存最多 3 窗且键包含身份代次/book/section/hash/offset；切章、切书后前台和预取都取消。加载失败不丢当前文本且只在用户重试时再次请求。
- [ ] 写恢复用例：无记录从第 1 节开始；hash 改变从该节开头恢复并显示原因；网络失败保留 dirty 与重试入口；readerPosition 不调用 updateReadingProgress。
- [ ] 写导航用例：首页书卡显式进入 book，选中书籍身份与摘要一致；默认 openBook 和“继续对话”仍进入 workspace。book 不加载正文，book/reader 不调用 prepareBook 或创建 session；首次展开助手只准备一次；同书 book/reader/workspace 切换保留 sessionId/messages/draftInput；切换聊天书籍后才准备新书，迟到初始化不能导航到旧书。
- [ ] 运行 `npm test -- src/lib/book-reader-api.test.ts src/lib/book-workspace-navigation.test.ts src/store/useReaderStore.test.ts src/store/useBooksStore.test.ts`，确认新增契约失败。
- [ ] 实现 API 与新 store：按 scope 管理 AbortController、generation 和同窗口请求合并，15 秒结束请求；一个前台请求加至多一个相邻预取，正文窗口最多 3 个；不持久缓存正文。对保存队列只合并尚未发送的更新，已发送请求的 revision 响应不能乱序应用。
- [ ] 实现新导航模块，为 useBooksStore 的 openBook/clearPrivateState/相关进度写回加入代次和 bookId 校验，保存与关闭使用新 store 的清理入口；首次 book/reader 不准备聊天，保留当前账号恢复与主题改动。
- [ ] 重跑上述命令，再运行 `npm test -- src/App.test.tsx src/lib/app-flow.test.ts src/store/useChatStore.view.test.ts`。

**可审阅交付：** 快速切书、登出与保存冲突的确定性测试，以及正文不进入浏览器持久存储的代码证据。

## 4. 阅读页面、文字锚点和排版设置

**Files**

- 新建：`client/src/components/BookReader/index.tsx`、`components/ReaderBody.tsx`、`ReaderToolbar.tsx`、`ReaderContents.tsx`。
- 新建：`client/src/components/BookOverview/index.tsx`、`BookOverview.test.tsx`，单书入口页标题为“本书空间”。复用现有 AppHeader/ScenicBackground/BookCover 与全局外观 store，不新增背景组件或独立外观存储。
- 新建：`client/src/lib/reader-text-position.ts`、`reader-text-position.test.ts`。
- 新建：`client/src/store/useReadingPreferencesStore.ts`、`useReadingPreferencesStore.test.ts`。
- 新建测试：`client/src/components/BookReader/BookReader.test.tsx`。
- 修改：`client/src/App.tsx`、`lib/app-flow.ts`、`lib/app-flow.test.ts`、`components/Entrance/index.tsx`，增加 book/reader 视图，将首页书卡连接到本书空间，保留明确的继续对话快捷入口。
- 新建：`client/src/theme/reader.css`；只在 `client/src/index.css` 增加必要 import，复用当前 token。

**Interfaces**

- `splitReadingParagraphs(text: string,startOffset: number): Array<{text:string;startOffset:number;endOffset:number}>`，保留空格和换行对应的原偏移。
- `measureReadingOffset(root: HTMLElement): number | null`、`restoreReadingOffset(root: HTMLElement,offset: number): boolean`；以带绝对偏移的文本节点和 DOM Range 定位，不以 scrollTop 持久化。
- 偏好：fontSizePx 16—28/default20，lineHeight 1.6—2.2/default1.9，widthPx 480—800/default640；localStorage 只保存这三个数值。

- [ ] 写文字映射测试：空行、缩进、emoji、窗口切在长段中间、长达 50000 code unit 的无换行段落，拆分后的偏移和原文严格对应；不 trim 或反复 normalize。
- [ ] 写阅读组件用例：正文中的 HTML/script 标签按文本展示；目录与上一节/下一节正确导航；第一/末节禁用对应按钮；加载失败显示重试且不清空已读内容；当前与相邻正文窗口合计不超过 3 个。
- [ ] 在 useReaderWindows.test.ts 中以可控 IntersectionObserver 测试接近边界加载、重复回调去重、离开窗口后的有界渲染、反向滚动重新加载和 observer cleanup；组件测试确认淘汰窗口保留占位，字体变化按文字锚点恢复，不将 scroll 更新扩散到所有消息和目录。
- [ ] 写偏好用例：无值使用默认值，非法 localStorage 内容恢复默认，数值越界拒绝；记录中没有 bookId、正文、会话或身份信息。
- [ ] 写流程用例：同书 reader/chat 切换保留会话；首次进入 reader 不根据助手范围跳到末尾；目录预览后返回续读锚点；应用原有 auth/reset-password 路由不受 reader 影响。
- [ ] 写 BookOverview 流程测试：首页点击封面/标题/书卡进入选中书；该页使用“本书空间”标题，不显示书架总数；阅读、聊天及返回书库入口目标正确，未点击入口前不加载正文或聊天。切换背景/主题后前往 reader/workspace，useAppearanceStore 的选择不变；同书 BookCover 的绑定不变。复用控件的 Escape/焦点语义保持原有行为。
- [ ] 运行 `npm test -- src/lib/reader-text-position.test.ts src/store/useReadingPreferencesStore.test.ts src/components/BookReader/BookReader.test.tsx src/lib/app-flow.test.ts src/App.test.tsx`。
- [ ] 实现 useReaderWindows 与有界窗口展示：IntersectionObserver 在内容边界约一个视口处触发相邻预取，测量用 requestAnimationFrame 合并，保留窗口占位高度；字体/宽度变化时重新测量并恢复文字锚点，避免移除旧窗口使视口跳动。组件读取步骤 3 的 store，不直接调用进度 API。App 通过 lazy import 单独加载 BookReader，原 BookChat 的 lazy import 保留。
- [ ] 运行 `npm test -- src/components/BookReader/useReaderWindows.test.ts src/store/useReaderStore.test.ts src/components/BookReader/BookReader.test.tsx`，要求按需请求与有界渲染用例全部通过。
- [ ] 实现 BookOverview，复用全站头部、背景、封面和主题 token；首页书卡显式进入该页，阅读/聊天按钮分别进入对应模块，返回入口为我的书库，reader/chat 的返回入口为本书空间。接入可访问目录和排版控制；刷新和重排只恢复文字位置，不触发保存。
- [ ] 运行 `npm test -- src/components/BookOverview/BookOverview.test.tsx src/store/useBooksStore.test.ts src/lib/book-workspace-navigation.test.ts src/lib/app-flow.test.ts src/App.test.tsx`，确认新增页面、全局外观复用与导航契约通过。
- [ ] 重跑上述测试。happy-dom 不具备真实排版能力，DOM Range 与滚动精度还必须通过步骤 6 的真实浏览器验收，不能仅凭 mock rect 宣称通过。

**可审阅交付：** 连续阅读页面、独立排版偏好与文本锚点测试；真实布局和续读精度留到浏览器验收。

## 5. 阅读助手面板、独立聊天与引用回原文

**Files**

- 新建：`client/src/components/BookReader/components/ReaderAssistantPanel.tsx`、`ReaderAssistantPanel.test.tsx`。
- 修改：`client/src/components/BookChat/components/Sidebar.tsx`，仅增加“阅读本书”快捷入口；保留 BookChat/index.tsx 原页面结构，不增加 embedded 变体。
- 修改：`client/src/components/BookChat/components/ReferenceCard.tsx`、`MessageBubble.tsx`；新建 `ReferenceCard.test.tsx`。
- 修改测试：`client/src/components/BookChat/BookChat.reading.test.tsx`、`client/src/components/BookReader/BookReader.test.tsx`。

**Interfaces**

- `ReaderAssistantPanel({bookId: string,onClose: () => void})` 仅展示同书消息和输入，复用现有 InputArea、MessageBubble 与 useChatStore；展开时调用步骤 3 的 ensureBookChat。全功能聊天继续由原 BookChat 承担。
- 引用卡片使用现有 `Reference.bookId/sectionId/chunkId` 调用步骤 3 的 `previewReference()`，不能直接采用客户端提供的偏移。
- ReaderAssistantPanel 暴露打开/关闭动作；关闭时若生成中调用既有 stopGenerating，恢复阅读焦点，保留消息和输入草稿。
- 面板内“进入聊天页”和原聊天侧栏“阅读本书”通过新导航模块切换，同书不清消息或草稿；阅读位置与助手范围均不因切换而改变。

- [ ] 写面板测试：打开/关闭/重开保留同书会话与草稿；新书不沿用旧书对话；关闭正在生成的面板触发取消，旧 SSE 不能补写；移动面板支持 Escape 和焦点返回。
- [ ] 写独立聊天回归：从本书空间聊天入口或首页“继续对话”仍显示原 Sidebar、历史、助手设置和 InputArea；邮件、联网开关和停止生成保持原行为。打开 reader 不能将 BookChat 替换为正文页；同书面板/聊天页之间切换保留当前对话。
- [ ] 写引用测试：正常 locator 返回准确高亮与临时预览；precision=section 显示无法精确高亮；404 保留引用卡并允许尝试原章节；重复原句不搜索猜定位；越过当前助手范围先提示再主动阅读。
- [ ] 写防剧透流程用例：阅读第 18 节、助手范围第 1—17 节时，reader 打开/预加载/保存/引用返回都不调用 reading-progress PUT；聊天 body 仍仅发送现有 sessionId/message/单次开关。
- [ ] 运行 `npm test -- src/components/BookReader/components/ReaderAssistantPanel.test.tsx src/components/BookChat/components/ReferenceCard.test.tsx src/components/BookChat/BookChat.reading.test.tsx src/store/useChatStore.view.test.ts`。
- [ ] 实现新阅读面板、显式导航和引用跳转，原 BookChat 布局与完整功能保持现状；阅读面板复用现有消息/输入组件与聊天 store，不能将正文窗口隐式追加到模型输入。当前历史恢复没有引用元数据，历史消息按原行为展示，不推测恢复引用。
- [ ] 重跑以上测试和 reader 页面测试。在 server 运行 `npm test -- --runInBand reading-progress.policy.spec.ts book-reading.service.spec.ts book-chunk-retriever.service.spec.ts book-chat.service.spec.ts`，确认 section ceiling、查询过滤和停止语义不变。

**可审阅交付：** 原文—助手—引用的完整交互、临时预览返回，以及章节范围未被阅读操作扩大。

## 6. 可重复的浏览器验收、质量门与文档

**Files**

- 新建仅测试入口：`client/reader.acceptance.html`、`client/test/reader-acceptance.tsx`、`client/test/fixtures/reader-fixtures.ts`，不加入正式 App 路由或默认生产 HTML 构建入口。
- 新建：`docs/reader-acceptance.md`，记录命令、退出码、验收项与未验证项。
- 修改：`AGENTS.md` 的范围导航、`docs/superpowers/specs/2026-08-29-private-reading-assistant-mvp-design.md` 的阅读器范围与新规格入口；只改相关段落。
- 修改：`readme.md`、`client/README.md`、`server/README.md` 的功能入口、接口或专用验证命令；避免复制规格细节。

- [ ] 编写合成 fixture：两本 READY 书、一本 SYSTEM 书、一个 80000 code unit 章节、emoji/重复句/HTML 字样/50000 code unit 长段，以及固定引用、SSE、冲突/断网响应。不得使用上传目录或真实小说。
- [ ] 测试入口在挂载 App 前安装 mock fetch，覆盖恢复认证、书架、目录、位置、正文、引用与固定聊天请求；未列入 allowlist 的请求直接失败。阻断测试入口中的 XMLHttpRequest 和 sendBeacon，不能落入现有 localhost:3000 代理。示例身份和令牌仅为公开测试值，测试入口不启动真实后端。
- [ ] 在 client 运行 `npm run dev -- --host 127.0.0.1`，使用启动输出中的实际端口访问 `/reader.acceptance.html`。该 Vite 服务只用于合成 fixture；不启动 API、worker 或真实模型。
- [ ] 在真实浏览器检查 375×812、768×1024、1440×900，分别覆盖明/暗主题；记录截图或观察证据。通过标准：页面无水平溢出，手机面板不横向挤压正文，目录/面板支持 Tab/Escape 和焦点恢复。
- [ ] 从首页点击图书进入本书空间，再分别进入阅读、聊天并返回；截图确认首页和单书页职责、标题与目标正确。单书页更换背景、切换明暗主题，进入 reader/workspace 后外观保持一致，封面图案和颜色不变；375px 下背景控件可操作且无水平溢出。阅读助手仅在 reader 展开，原聊天布局完整保留。同书切换前后比较 sessionId/messages/draftInput 和续读 revision，均不应被无关导航重置。
- [ ] 将长段落读到中部，确认保存成功后刷新；改变字号 20→28、宽度 640→480 和窗口宽度后，原锚点仍出现在正文可见首行附近，误差不超过一行。记录具体 fixture offset、保存 revision 和恢复 offset。
- [ ] 滚动遍历 80000 code unit 章节，验证正文窗口拼接无遗漏/重复，DOM 中真实正文窗口最多 3 个；引用预览前后 GET reading-position 的 sectionId/offset/revision 不变。fixture 模拟 CAS 只证明界面，真实 CAS 仍以步骤 2 的专用 PostgreSQL 测试为准。
- [ ] 在 Network/fixture 请求日志检查首屏、预取与切章：首屏没有请求全书或全部章节，同 offset 重入请求合并，每个正文响应最多 32000 code unit；人为延迟/断开下一窗口后当前正文保留且重试可达。通过 Performance 面板记录长时间滚动与字体调整是否出现持续长任务；写明设备和测量结果，不以合成延时模拟充当真实网络性能证据。
- [ ] 用 fixture 切 A→B 并延迟 A 返回，验证屏幕和续读位置仍属于 B；再模拟两个标签页冲突与保存断网，检查提示、重试和服务端确认状态不被伪装。
- [ ] 更新上述文档，说明章节级防剧透、独立续读位置、当前回答引用跳转、最后未保存位置的限制。将原设计“暂不做阅读器”标明由新规格扩展，不删除历史决策背景。
- [ ] 再检查 server 默认 Jest 发现范围与环境加载安全，确认新增 DB 测试被排除后分别执行 `npm run check`（client、server）。通过标准：两包退出码都为 0；无关基线失败须逐条记录，不能为本功能改无关代码。
- [ ] 专用数据库验收仅在满足步骤 2 的隔离条件时运行 `npm run test:db:reader`。`npm run test:e2e:reader` 当前会创建/删除 fixture 且调用真实依赖，未经此次授权与各目标隔离核对不得执行；未执行时必须写清原因。
- [ ] 运行 `git diff --check`，审阅本次文件 diff 与 `git status --short`，确认没有凭据、真实正文、生成物或无关变更。保留用户既有改动，不自动提交。

## 分步依赖与交付门

`0 → 1 → 2 → 3 → 4 → 5 → 6`。接口、位置和状态隔离先于大面积 UI 接入。

| 阶段完成后 | 可观察交付 | 必须具备的证据 |
| --- | --- | --- |
| 1 | 可以按授权读取正文和定位片段 | mock 查询作用域、拒绝路径、窗口无损测试 |
| 2 | 可以保存独立续读位置并拒绝旧版本 | 单测；隔离 PostgreSQL CAS/级联结果单独报告 |
| 3—4 | 可以滚动阅读、设置排版、保存并恢复 | 确定性客户端流程测试＋真实浏览器锚点检查 |
| 5 | 可以同书提问、从引用返回并继续阅读 | 会话保留、取消与防剧透不变的前后端回归 |
| 6 | 可以形成完整交付报告 | 两包 check、浏览器验收、diff 与未验证项清单 |

## 验收记录模板

每一项记录：`编号 / 命令或操作 / 使用的合成输入或隔离目标类别 / 实际结果 / 证据 / 通过、失败或未运行`。不记录连接串、账号完整标识、真实正文或本机私有路径。

完成报告必须分别列出：相关单测、两包质量门、真实浏览器布局与文字位置、隔离数据库并发与级联、真实模型闭环。没有实际执行的项目不得写“通过”。若仅缺隔离库，核心实现可交付供审阅，但不能宣称真实数据库 CAS、迁移部署或外部闭环已验证。
