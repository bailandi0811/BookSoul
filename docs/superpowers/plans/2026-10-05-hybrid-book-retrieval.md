# 单书混合检索实施计划

## 当前生效计划：先做选型对比（2026-10-05 修订）

用户指出全局 BM25 统计、主基线、融合策略及清理/版本选择缺口后，暂停下方原 Task 1–8。它们作为历史实施草案保留，不执行。以技术方案开头“生效修订”及本节任务为唯一契约；目前仅修改文档。

**Goal:** 证明选择哪种词法路径与融合策略能够相对今天的纯向量路径改善证据召回，同时满足可见语料统计、性能与数据最小化约束。

**Scope:** 冻结基线、独立实验工具、合成/许可语料评测和选型报告。不开生产双索引路径、不修改 Planner、不新增迁移/生产依赖/配置、不连接真实数据执行写入。实验代码不作为未验收产品功能交付。

### 修订任务 A：冻结当前纯向量路径

**Files:** 拟新增 `server/test/hybrid-probe/baseline.ts`、`baseline.spec.ts`、`fixtures.ts` 与探针独立测试配置；不修改生产 Planner/检索器。

**Interfaces:** `BaselineSnapshot` 记录源码摘要、profile、查询输出、语料版本与 ceiling、原始候选及预算；`replayCurrentDense(snapshot): ProbeResult` 重放当前 mergeHits 排序和最终选择，必须由当前检索器对照证明一致，不能只手写一个近似实现。

- [ ] 先写基线对照回归：原问题优先/最多三条、原候选数、rankScore → 最大 cosine → firstSeen、重叠去重、章节配额与最终字符预算。
- [ ] 固定多查询/追问的已脱敏 Planner 输出，允许重放时复用 embedding 和候选；端到端随机性另测。
- [ ] 主基线为当前 B0。候选数/融合次序/查询变更分别建立独立消融，不以新的 dense 路径替换 B0。

### 修订任务 B：当前可见语料 BM25 探针

**Files:** 拟新增 `server/test/hybrid-probe/visible-bm25.ts`、`.spec.ts`、`tokenization.ts`、`.spec.ts`。

**Interfaces:** `scoreVisibleCorpus(corpus, queries, profile): RankedHit[]` 输入必须由 scope 校验后的可见语料构成，N/df/avgdl 均从完整 corpus 计算；`ProbeProfile` 固定 tokenizer、BM25 参数与规范化。

- [ ] 先写数值可手算的 BM25 测试，验证未先裁剪命中语料、零结果、空词、重复词、长度归一化。
- [ ] 先写扰动测试：加入不同书籍、未读块、旧版本/失败代次后，相同可见语料的排名/分数不变；跨 owner/book 在输入查询阶段拒绝。
- [ ] 对比无需新增依赖的 Intl.Segmenter 与字符 n-gram；报告专名、中文英文数字和罕见词的 token 与 Recall 限制，不能称它们等同 Jieba。
- [ ] 探针首版无正文缓存。真实只读数据库接入前核验路径/目标，使用授权 scope 和一致性快照；默认只用合成内存语料。
- [ ] 加入扫描字节/块数/时间/内存与取消预算，超限明确失败，不截断语料冒充完整 BM25。

### 修订任务 C：统计作用域、融合与资源消融

**Files:** 拟新增 `server/test/hybrid-probe/ranking.ts`、`.spec.ts`、`evaluate.ts`、`.spec.ts`、`benchmark.ts`。

**Interfaces:** `evaluatePaired(baseline, candidate): PairedReport` 返回逐题改善/退化、分组指标与置信区间；`compareFusion(dense, lexical, profile): RankedHit[]` profile 明确为实验策略，不配置进生产。

- [ ] 比较等权 RRF、向量偏重 RRF、保留向量顺序的词法补充；并列优先沿用原向量融合序，最后 chunkId。
- [ ] 分别报告 B0、只改候选数、只改融合、加入词法四种结果。若需改查询，再另列实验，本轮先冻结。
- [ ] 按 4/6/8 最终片段和字符预算评估，多证据覆盖同时报告裁剪前后。
- [ ] 初版 60 题只验证机制/趋势；输出多对几题、多错几题、置信区间及每个关键退化，再以独立多书验收集验证泛化。既有百分比门槛降为探索目标，不声称已证明质量收益。
- [ ] 做可见块数/字节数/并发量梯度，覆盖读完长书；记录冷读取、分词/评分、p95、内存和总请求预算。
- [ ] 如果有已验证的隔离 Milvus/Zilliz，增加原生 BM25 对比；同 tokenizer 的本地全局/可见统计对照用于隔离 IDF 效应。无目标时标为未验证，不自动连接现用集合。

### 修订任务 D：选型报告与下一步契约

**Files:** 拟新增 `docs/hybrid-retrieval-selection.md`；按结论改写技术方案与实施计划，不修改生产代码。

- [ ] 优先评估本地可见语料方案能否满足预算；不满足时比较本地持久词频/倒排方案，新增依赖/数据库设计先评审。
- [ ] 记录选择依据、剩余风险、质量/资源预算。请求内本地方案成立时删除原稿双集合、READY 任务、补建和删除改造范围。
- [ ] 如选择持久索引：单独落实当前 profile 精确版本选择、唯一激活 generation、阶段 checkpoint、词法失败不删 dense、旧 worker 无清理权限的回归，不能使用任意 READY。
- [ ] 运行独立的无数据库探针测试，检查文档与差异；未授权的模型/数据库/Milvus 实验明确披露。
- [ ] 交付实验结果后再确认生产选型与具体实施计划。原方案的真实迁移、外部正文写入和旧书补建没有自动授权。

### 本次修订记录

- 当前 Planner 已保留原问题且最多三条；取消原计划重复改写 Planner 的任务。
- 现有 vectorize 将 completeEmbedding 放在会 deleteVersion 的 try/catch 内；若未来使用持久词法索引，必须将词法处理及 READY finalization 移出清理边界。
- 等权 RRF 和 chunkId 并列次序改为待实验策略；当前配置必须精确匹配，不能任意选择 READY。
- 尚未执行上述探针、生产代码改动或真实数据操作。

---

## 以下原实施计划已暂停，仅保留评审历史

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现可恢复、可删除、受用户/书籍/版本/阅读进度限制的向量 + BM25 检索，并用固定评测证明收益。

**Architecture:** 保留现有稠密向量集合，增加独立词法集合。使用持久词法索引任务与 ingestion 阶段检查点协调生命周期，由现有检索器执行两级 RRF、授权回读和上下文选择。

**Tech Stack:** NestJS、TypeScript、Prisma/PostgreSQL、现有 @zilliz/milvus2-sdk-node 2.6.12、Jest；不新增生产依赖。

**Spec:** [技术方案](../specs/2026-10-05-hybrid-book-retrieval-design.md)，已获用户同意进入实施计划阶段。

**执行方式:** 本会话由主 Agent 顺序实施，保留现有工作区；不创建分支、提交或推送。完成后按技能要求进行独立代码审查。

## Global Constraints

- 最多三条检索查询、六个候选列表、300 个原始命中；最终片段数与字符预算沿用 Planner。
- 每路候选数 min(50, max(10, 2 × 最终片段数))；两级等权 RRF，k=60，rank 从 1 开始，稳定 chunkId 打破并列。
- 查询同时过滤 ownerScope、bookId、embeddingVersion、spoilerCeiling；词法路额外过滤 lexicalVersion、buildGeneration。
- SYSTEM 示例书保留 __system__ 范围；私有书 owner 来自认证上下文。
- hybrid 运行故障不降级；旧书未完成补建时允许显式 legacy_dense。
- 不改切块、回答模型、REST/SSE 公开字段；不做多 Agent 产品功能或模式 UI。
- `.env`、既有部署配置、生产依赖、真实数据库/向量库/上传目录保持原样。生成迁移文件不等于运行迁移。
- 实际服务能力、原文副本写入、补建 allowlist、迁移目标和服务保留政策必须在激活前核实；未授权不运行外部写入。
- 所有已有未提交改动保留，尤其 schema.prisma、package.json、server/README.md；每次编辑前检查当前差异，不全仓格式化。

## Review Focus

1. BM25 数量相等但 chunkId 或正文错误：校验失败，不能 READY（任务 4）。
2. 新书 hybrid 曾完成后词法记录消失：报错，不能误判为旧书而降级（任务 5）。
3. 删除发生在索引写请求已发送之后：无法证明请求结束时保留 DELETING（任务 6）。
4. 中文查询包含英文字母、数字或罕见专名：分析器必须固定并记录可测限制（任务 1、3、7）。
5. 旧 worker 失租后迟到：不能更新新 generation 状态，也不能清理新 generation（任务 2、4、6）。

## 前置调查与验证边界

已只读确认：当前安装 SDK 为 2.6.12；已有查询融合和 scoped hydration；向量集合没有正文；当前 vectorize 内部完成 READY；重试会重新解析与切块；默认 Jest 排除 *.db.spec.ts。远端版本、BM25 能力、原文保留政策和真实评测结果尚未确认。

先完成可审阅计划，用户评审后进入代码实施。任务 1 分为不连接外部服务的本地核验和显式隔离目标上的能力验证；没有隔离目标时不把 mocks 当作实际服务证明。可先交付未激活的实现及本地回归，但实际能力/收益未验证时不能称本阶段验收完成。

## Task 1：SDK 能力契约、分词探针与隔离门禁

**Files:** 创建 `server/src/vector/book-lexical.types.ts`、`server/src/vector/book-lexical-profile.ts`、`server/test/support/hybrid-target.ts`、`server/test/hybrid-capability.spec.ts`、`server/test/jest-hybrid.json` 及对应无数据库单元测试。专用脚本入口在任务 7 汇总添加。

**Interfaces:**

- `BookLexicalScope = BookVectorScope & { lexicalVersion: string; buildGeneration: string }`。
- `BookLexicalRecord` 包含 scope、chunkId、sectionId、sectionOrder、chunkIndex、content、contentHash。
- `assertHybridTestTarget(input): ValidatedHybridTestTarget`：input 中 TEST_DATABASE_URL、当前 DATABASE_URL 的解析信息、生产与测试向量目的地/集合均按 unknown 验证；不得隐式加载 .env。
- `probeHybridCapabilities(client, testTarget): Promise<HybridCapabilityReport>`：报告实际版本、分析器 token、过滤结果与原生取消能力；仅接受经过门禁的目标。

- [ ] 先写门禁拒绝测试：缺失 TEST_DATABASE_URL、非 *_test 数据库、非 test_* schema、host/port/database/schema 全同、URL 无法解析、测试集合与现用集合重合时抛错。
- [ ] 运行 `npm test -- --runInBand hybrid-target`，确认新增断言因缺少门禁行为失败；实现后同命令通过。
- [ ] 读取已安装 SDK 的 BM25 Function、schema、upsert、query iterator、runAnalyzer、RPC 超时/取消类型与实现，记录实际可调用签名，不用 any 绕过类型。
- [ ] 探针在合成文本上比较 chinese 与显式 jieba 配置，检查中英数字保留、跨 owner/book/ceiling 过滤及索引就绪；只清理本次 fixture ID，不 drop 集合。
- [ ] 在明确提供并验证隔离目标后运行探针。无目标时记录未运行项，保留后续激活门禁；不自动连接开发库验证能力。
- [ ] 根据实测结果固定不可变 lexicalVersion（含分析器、BM25 参数和规范化规则）。不能满足能力要求时报告选型问题，不升级服务。

## Task 2：索引状态、租约与 ingestion 阶段检查点

**Files:** 修改 `server/prisma/schema.prisma`；创建 `server/prisma/migrations/20261005120000_book_lexical_index/migration.sql`、`server/src/ingestion/book-lexical-index.repository.ts`、`.spec.ts`、`book-lexical-index.types.ts`；修改 `ingestion-job.types.ts`、`ingestion-job.repository.ts`、`.spec.ts`。

**Interfaces:**

- `BookLexicalIndex` 使用设计中的唯一范围、状态、generation、计数、尝试次数、租约与失败字段；补充 `verifiedAt` 及写请求状态以支持校验与删除。
- `IngestionJob` 增量添加 `stage: PARSE | VECTOR | LEXICAL | COMPLETE`（历史默认 PARSE）、`leaseToken`、`leaseExpiresAt`；ClaimedIngestionJob 返回 stage/token。stage 是重试检查点，不能仅凭片段数量判断向量成功。
- `enqueue(scope): Promise<void>`、`claimNext(now): Promise<ClaimedLexicalJob | null>`、`assertLease(job): Promise<void>`、`complete(job, verification): Promise<void>`、`fail(job, stableCode): Promise<void>`，所有写入使用 token/generation CAS。
- `prepareLexicalStage(job): Promise<void>` 只在向量校验通过后提交 LEXICAL；`completeEmbedding(job)` 改为检查两路校验及有效租约后提交 COMPLETE/READY。

- [ ] 先写 repository 测试：同范围重复 enqueue 不重复任务；双 worker 只能一方 claim；旧 token 不能更新进度/完成/失败；版本变更/DELETING 时拒绝；计数相等但未验证不能 complete。
- [ ] 用相关 Jest 跑出预期失败，再实现最小持久契约并复跑通过。
- [ ] 编写仅新增表/字段/索引的 SQL；不修改已应用迁移，不运行 migrate dev/deploy/reset。
- [ ] 审核迁移针对当前工作区 schema 的增量，保留用户已有 profile/community 变更。检查 Prisma 校验/生成命令的环境读取路径后，只执行不连接数据库的 validate/generate（必要时使用非真实占位连接串）。
- [ ] 更新 stale recovery：按持久 stage 恢复，不把 LEXICAL 任务重置成 PARSE；建立失败/失租的稳定处理语义。

## Task 3：BM25 存储服务

**Files:** 创建 `server/src/vector/book-lexical-store.service.ts`、`.spec.ts`；修改 `book-vector.module.ts`；仅对现有向量服务增加所需取消/计数校验接口，不重构既有 schema。

**Interfaces:**

- `ensureCollection(): Promise<void>`：校验存在集合的字段、Function、metric 和不可变分析器，不自动修复不兼容集合。
- `upsert(records, options?): Promise<void>`；`searchChunkIds(scope, query, ceiling, limit, options?): Promise<BookVectorSearchHit[]>`。
- `verifyVersion(scope, expected): Promise<LexicalVerification>`：分页核对 chunkId + contentHash 集合、等待稀疏索引可用；`deleteVersion(scope)`、`deleteBook(ownerScope, bookId)` 都严格 scoped。
- 集合新增 `content_hash`，用于正文一致性核验，查询不返回 content。集合名通过显式构造配置传入；新增真实环境配置留到激活步骤确认。

- [ ] 先写测试覆盖稳定主键、重复 upsert、非成功 RPC 状态、UTF-8 超容量拒绝、参数注入拒绝、两路作用域与额外 lexical/generation 过滤、SYSTEM scope、空结果与异常的区别。
- [ ] 运行 `npm test -- --runInBand book-lexical-store` 确认失败，再实现并复跑。
- [ ] 记录 SDK 原生取消能力；每次请求有明确 deadline，取消后阻止新请求。若原生取消不可用，测试证明仅有界收束，不声称远端即时取消。
- [ ] 测试现有集合 schema 与分析器不匹配时明确失败，不能删集合重建；失败清理只针对本次 generation。

## Task 4：新书双索引与词法失败恢复

**Files:** 创建 `server/src/ingestion/book-lexical-index.processor.ts`、`.spec.ts`；修改 `book-vectorization.service.ts`、`ingestion-processor.service.ts`、`ingestion-worker.service.ts`、`ingestion.module.ts` 及相邻测试；修改 `server/src/books/books.service.ts`、`.spec.ts` 的重试逻辑。

**Interfaces:**

- `BookLexicalIndexProcessor.process(job): Promise<void>`：每批读数据库片段，检查 token，upsert，持久写请求结果，核对内容集合与查询就绪后 CAS 完成。
- `BookVectorizationService.vectorize(job)` 成功后只提交 LEXICAL 检查点；词法阶段完成才调用最终 READY 方法。
- worker 处理删除优先，其次新书与旧书词法任务；恢复/重试尊重 stage 与租约，无内存唯一状态。

- [ ] 先写失败测试：向量成功 BM25 失败时 Book 不 READY；重试不调用 parser、chunker、embedBatch；重启仍从 LEXICAL 恢复；校验同数量错误 ID/正文拒绝；失租不能 READY。
- [ ] 运行相关 ingestion/books Jest，确认新增失败条件，再实施。
- [ ] 将向量异常清理保持在向量阶段，词法失败不清理已校验向量；finalization 的数据库错误不能被误归为向量失败并删除有效索引。
- [ ] 默认不改 .env 或部署开关；在真实激活前不启动应用/worker，让新增原文写入保持未执行。
- [ ] 瞬时故障有限退避重试、非瞬时故障直接 FAILED；恢复机制保留显式 retry，取消不重试。

## Task 5：混合检索接入与授权回读

**Files:** 创建 `server/src/chat/book-retrieval-ranking.ts`、`.spec.ts`；修改 `book-chunk-retriever.service.ts`、`.spec.ts`、`book-context.service.ts`、`.spec.ts`、必要的 planner 与测试；修改 `book-chat.service.ts` 及相邻 SSE/取消回归。

**Interfaces:**

- `fuseHybridRanks(denseGroups, lexicalGroups): BookVectorSearchHit[]`，分路去重/多查询 RRF，再跨路 RRF。
- `retrieve(boundary, request, options?: { abortSignal?: AbortSignal; traceId?: string }): Promise<RetrievedBookChunk[]>`；索引状态从持久 repository 解析，不接受客户端模式或 generation。
- historical READY + 非 COMPLETE ingestion stage + 未完成补建 → legacy_dense；COMPLETE 新书或 READY 词法索引 → hybrid。后者索引丢失/不兼容必须报错，不能回到 legacy。

- [ ] 先写排名测试，用输入排列、重复命中、不同原始分数验证融合结果及稳定并列。
- [ ] 写检索回归：BM25 命中向量未找到的专名；两路同过滤；向量与 BM25 真并行；任一路故障整次失败；单路空结果正常；两路空结果无依据回答。
- [ ] 写拒绝路径：跨 owner/book、旧版本、未读章节、DELETING、查询过程中版本变化、SYSTEM 可见性非法，模型不收到越界原文。
- [ ] 跑相关 Jest 得到预期失败，再实现授权关联查询及排名；保留去重、配额、原文回读和截断行为。
- [ ] Context 在最多三条查询中保留已脱敏当前问题，baseline 采用同查询；不能将未脱敏邮箱从原问题重新送入检索。
- [ ] `traceId` 使用服务端已有 run 标识或随机标识，日志只含模式/版本/数量/耗时/错误码；保持对外 score 字段兼容，不把新融合分数当置信度。
- [ ] 将 abortSignal 传至 query Embedding 与词法路；取消后无新搜索/重试/迟到引用，现有 SSE 终止语义不改变。

## Task 6：删除、清理和并发写入收束

**Files:** 修改 `server/src/books/books.service.ts`、`.spec.ts`、`server/src/ingestion/book-deletion-processor.service.ts`、`.spec.ts`、`book-lexical-index.repository.ts`、`.spec.ts`、必要的索引存储服务及测试。

**Interfaces:**

- DELETING 事务撤销词法租约；`assertWritesSettled(ownerScope, bookId): Promise<void>` 使用持久写请求状态与 RPC 确认，不凭固定 sleep 或进程内列表推断安全。
- `cleanupCancelledGeneration(job): Promise<void>` 只清理自己的 generation；数据库取消记录在远端清理确认前保留。
- deletion 按 book 删除两种集合所有版本，校验 scoped count=0，再源文件，再数据库。

- [ ] 先写受控延迟 Promise 回归：写已发送后删除、写 ACK 迟到、超时结果不明、旧 worker 完成、删一集合失败、失败清理与新 generation 并发。
- [ ] 跑相关 Jest 得到失败，再实现；无法证实写入已结束时保留 DELETING/任务并重试核对。
- [ ] 核验 RPC deadline 是否提供结束保证；若只表示客户端停止等待，不能据此删除数据库后宣称完成。需要保留可恢复的不确定状态并报告部署限制。
- [ ] 确认没有无条件 deleteMany/TRUNCATE/drop 集合，重复删除幂等，不清理其他 book 或用户数据。

## Task 7：旧书补建、评测与隔离集成工具

**Files:** 创建 `server/src/scripts/backfill-book-lexical.ts`、`.spec.ts`、`server/test/hybrid-retrieval.db.spec.ts`、`server/test/fixtures/hybrid-retrieval.json`、`server/src/scripts/evaluate-book-retrieval.ts` 及独立指标测试；按最小范围修改 `server/package.json`，不用新依赖。

**Interfaces:**

- 补建默认 dry-run，`--apply --book-id <id>` 可重复添加 allowlist；读取 .env 的路径需显式记录，目标确认前不运行。scope 从 owner/visibility 反查，不接受操作者伪造 owner。
- 专用集成测试使用 `jest-hybrid.json` 与任务 1 的目标门禁，默认 check 不发现此测试。
- `evaluateRetrieval(cases, results): EvaluationReport` 输出类别 Recall、MRR、证据组覆盖、最终裁剪召回和延迟，不输出正文/身份；返回退出状态区分未验证与达标。

- [ ] 先写 CLI 测试：无 apply 无写入；apply 无 allowlist 拒绝；目标指纹不匹配拒绝；范围只含指定书；重复 enqueue 幂等；删除/版本变化时拒绝。
- [ ] 写指标测试：人工可算的小集合、无相关答案问题、零检索结果、预算裁剪、跨章节多证据与安全失败不得被平均值掩盖。
- [ ] 固定至少 60 题，类别 20/10/15/10/5，标注相关 chunkId/证据组/ceiling；调参与验收集合固定分开。合成用例覆盖安全与机制，真实质量结论注明代表性限制。
- [ ] 实际评测保持同 query、同语料快照和预算，对 dense/BM25/hybrid 分别运行；Embedding 外部调用仅在授权的合成/许可文本上进行。
- [ ] 集成回归覆盖过滤、补建重试、两索引 READY、所有 generation 删除和集合统计变化。只清理本次 fixture ID/前缀。
- [ ] 验收门槛按已确认设计：专名 Recall +10 个百分点、整体不降、语义下降≤3 个百分点、安全零越界、抽查引用合法、检索 p95 增量≤30%。实际目标不足时报告，不能改测试或只换问题集。

## Task 8：质量门、独立审查与激活交付

**Files:** 更新 `server/README.md`、MVP 设计第 9 节；创建 `docs/hybrid-retrieval-acceptance.md`。必要新增配置项先列出具体 diff，未经确认不改配置文件。

- [ ] 分别运行上述最相关 Jest，记录 RED/GREEN 与每个任务的进度，不提交代码。
- [ ] 运行完整质量门前检查默认发现列表、.env 加载路径和所有测试可能的外部访问；确认数据库集成测试排除后运行 `npm run check`。若环境无法证明安全，不运行并披露原因。
- [ ] 只在隔离外部依赖与授权满足时运行专用 hybrid 集成测试及 reader E2E；未满足时交付明确列出未验证项，不冒用默认开发库。
- [ ] 进行针对本任务最终 diff 的独立代码审查，重点为租约/CAS、过滤、迟到写入、原文日志、补建目标门禁与 score 兼容；保留用户其他改动。
- [ ] 审查发现的实质缺陷以回归测试复现并修复，重新跑受影响验证；不修复无关基线问题。
- [ ] 更新 acceptance 文档为实际命令、结果、失败/未运行项与脱敏指标；README 只保留稳定启动/升级/回滚入口。
- [ ] 准备可审阅的激活步骤：目标指纹、增量迁移、新集合配置/权限、原文副本保留政策、旧书 allowlist、影响量与恢复方案。用户确认后才运行真实迁移、原文补建及配置修改。
- [ ] 部署失败时不删有效向量/正文；运行故障不切单路。回滚需停 worker、使用兼容数据库增量表的旧代码，保留任务记录；物理清理另行授权。
- [ ] 最终检查本任务文件差异与工作区状态，无秘密/运行时数据/无关格式化；明确区分“实现通过本地验证”与“真实环境收益及升级验收完成”。

## 计划自检

技术方案的查询、存储、状态、上传、旧书、删除、取消、数据流、质量与运维要求分别由任务 1–8 覆盖。新增 ingestion stage/token 是实现不重复 Embedding、恢复及删除协调所需的最小检查点，不引入新产品行为或外部服务。五项 Review Focus 均有对应失败用例。真实运行能力与指标保留为激活前的验证门，不能通过 mocked 单元测试替代。

## 执行记录

- 2026-10-05：完成只读调查与实施计划。尚未修改生产代码、运行测试、迁移、补建或启动 worker。
- 待用户评审本实施计划后，按 Task 1 → Task 8 顺序执行。
