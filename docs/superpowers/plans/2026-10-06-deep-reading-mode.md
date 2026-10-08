# 快速与深度书内问答 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 不默认委派、建分支或提交；当前仓库 AGENTS.md 优先。用户已授权执行；当前实现与逐项验证状态以[验收记录](../../deep-reading-mode-acceptance.md)为准。以下步骤保留实施及复验要求，未勾选项不代表当前全部未执行。

**Goal:** 在既有混合检索之上实现可停止、可观察、可验收的快速/深度模式。

**Architecture:** 快速保留现有聊天路径。深度使用一个服务端编排器，结构化计划后最多运行三轮相同作用域的混合检索与证据检查，再调用一次回答模型；复用会话、租约、SSE 与引用设施。

**Tech Stack:** Node 22.19.x / npm 10、NestJS、TypeScript、现有 LangChain/OpenAI 兼容 provider、zod、Prisma/PostgreSQL、Milvus、React/Zustand、Jest/Vitest。无新增生产依赖。

**Spec:** [快速与深度书内问答设计](../specs/2026-10-06-deep-reading-mode-design.md)。执行者必须先读该设计、仓库 AGENTS.md 和[现有混合检索验收记录](../../hybrid-retrieval-acceptance.md)，不需要本次聊天记录。

## Global Constraints

- 第一版组合限制与预算已获用户认可并实施；实施不自动授权外部验收、部署、数据清理或迁移。
- 默认 quick；retrievalMode 与 responseDepth 独立。deep 不与联网/邮件组合，不召回或自动提取长期记忆；保留现有助手风格与有界近期对话。
- owner/book/version/ceiling 只从服务端可信上下文取得；相同边界贯穿所有轮次。模型输出不得取得工具或 runtime skill 权限。
- 本设计第 5 节为预算事实源：三子问题、三轮、九查询、最多五次书内 Chat 模型调用、编排 60 秒、在线响应 90 秒；不得引入隐式重试或兜底。
- 现有 quick、上传、索引、删除不改变；无 schema/.env/生产依赖修改，不创建长期缓存，不直接编辑生成物。
- 保留已有未提交工作；每步只检查和格式化本次文件。不建分支、commit、push 或 PR。
- 测试前核验脚本、发现范围、env 加载和实际目标；默认测试必须无数据库/向量/外部模型调用。真实环境不足时标记未验收，不复用实际数据目标。

## Review Focus

1. 追问历史可能过长或带旧书信息：只读取当前服务端会话，八条/8,000 字符，原文证据不来自历史。（任务 2、4）
2. 已发出但不支持取消的 Embedding 迟到：请求及时退出，迟到结果不搜索、不重试、不落库。（任务 3、4、5）
3. 补检替换了此前支持块：检查器重新检查实际最终集合，不继承被移除引用。（任务 4）
4. 隐藏 provider 重试/批次拆分：同时核验逻辑调用与实际 transport 次数，不以业务 spy 代替。（任务 2、3、7）
5. 测试脚本与运行中的 API/worker 连接不同数据库：三者目标一致可证明后才能验收。（任务 8）

## 顺序与检查约定

任务 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9，按顺序执行；不是可以脱离前置任务的独立模块。每项都提供独立测试及通过证据，完整计划不依赖此前聊天背景。

以下命令在注明的包目录运行，先完成任务 1 安全检查。Jest 定向文件名以默认 `src` root 解析。使用当前已安装工具，不为运行测试安装或改用户配置。若本机 npm shim 失效，可核验 `E:/Node.js/node_modules/npm/bin/npm-cli.js` 存在后，用 `node <已核验 npm-cli.js> ...` 执行同一命令；完整 check 的嵌套 npm 需要仅在当前进程修正 npm_config_prefix，不写配置文件。

## 任务 1：冻结基线与测试安全预检

**Files:** 只读 `AGENTS.md`、两个 package.json、CI、相关测试及其导入、chat 源码、`server/test/` 配置、reader E2E 脚本；Create `docs/deep-reading-mode-acceptance.md`（空白验收记录，不填虚构通过结果）。

**Interfaces:** 产出 B0/B1 的文件 hash 与取证来源、环境安全检查结果、验收记录模板；后续任务将运行证据填入该文档。

- [ ] 记录 git status、目标文件 diff 与 SHA256；区分已有工作与本轮新增。读取相关 README 与适用子目录规则。
- [ ] 以 `npm test -- --listTests`（server）只读确认数据库 spec 未进入默认发现；核验 ConfigModule、dotenv、Prisma/Milvus/provider 的测试替换。不能输出凭据或 .env 内容。
- [ ] 确认 client Vitest 配置/脚本不连接实际后端；核验 check 不执行数据库脚本。发现不安全项先报告，不运行全量。
- [ ] 记录 B1 当前 Planner、候选量、RRF tie break、Prompt 与检索输出；B0 从混合前实际源码/冻结记录复现。缺 B0 则标未完成，不用同一份新查询替代。
- [ ] 建立验收表：项目、命令、代码/fixture/model 版本、结果、原始报告路径、未验证原因。初始各项均待执行。
- [ ] 执行 `git diff --check`，确认文档无隐私、无敏感环境值。

**Done:** 测试可安全运行的证据已记录；基线可追溯或明确缺失，不声称效果已经通过。

## 任务 2：深度模型契约与无工具结构化调用

**Files:** Create `server/src/chat/deep-book.types.ts`、`deep-book-model.service.ts`、`deep-book-model.service.spec.ts`；Modify `server/src/chat/chat.module.ts`。

**Interfaces:** 在 types 中导出设计第 4 节全部类型和单一 `DEEP_BOOK_LIMITS` 常量；模型服务提供：

```ts
plan(query: string, recentMessages: BookConversationMessage[], signal: AbortSignal, runId?: string): Promise<DeepBookPlan>;
check(query: string, subquestions: DeepSubquestion[], selected: RetrievedBookChunk[], signal: AbortSignal, runId?: string): Promise<DeepEvidenceCheck>;
```

- [ ] 写失败测试 `plan_normalizes_ids_and_bounds_queries`、`rejects_unknown_fields_and_scope_override`、`check_rejects_foreign_or_evicted_chunk_ids`、`check_requires_exact_question_coverage`、`bounds_history_and_preserves_original_question`、`aborted_call_invokes_no_provider`。断言三问题、查询长度、supported 必有 ID、重复 coverage 拒绝及八条/8,000 字符。
- [ ] 在 server 运行 `npm test -- --runInBand deep-book-model.service.spec.ts`，确认失败针对缺失功能。
- [ ] 实现上述方法，现有 zod strict schema，服务端分配 q1…q3；无 bindTools、无任意 runtime skill 导入、无 fallback、无 retry；plan/check 各 5 秒、输出各 600 tokens，Prompt 上限 40,000 字符。
- [ ] 添加 provider timeout、非法 JSON、超长输出、正文注入与 transport retry 测试。断言失败无第二次 provider 调用，注入文本保持低优先级标记，不出现工具注册。
- [ ] 重跑该 spec，全部 PASS；将新服务加入 ChatModule，验证类型导入无循环。

**Done:** 模型只产生经过严格验证的计划与证据判断；不具备查询范围或工具授权。

## 任务 3：深度查询 Embedding 无重试选项

**Files:** Modify `server/src/vector/book-embedding.service.ts`/`.spec.ts`、`server/src/chat/book-chunk-retriever.service.ts`/`.spec.ts`。

**Interfaces:** 保持前两参数兼容，增加：

```ts
embedBatch(texts: string[], signal?: AbortSignal, options?: { maxAttempts?: number }): Promise<number[][]>;
// BookRetrievalRequest 新增 embeddingMaxAttempts?: number
```

- [ ] 写失败测试 `deep_attempt_limit_is_one`、`default_attempt_limit_preserves_ingestion`、`invalid_attempt_override_is_rejected`、`cancelled_embedding_does_not_start_vector_search`、`batch_transport_count_is_bounded`。验证覆盖选项只能降低、不能超过配置；SDK maxRetries=0；最多三查询时 transport 不超过三请求。
- [ ] 运行 `npm test -- --runInBand book-embedding.service.spec.ts book-chunk-retriever.service.spec.ts`，确认新增用例 RED。
- [ ] 实现可选次数校验与 retriever 透传；deep 使用 1，quick 和 ingestion 不传。保留现有向量/BM25 两路失败收束、IDF 可见范围与并列排序。
- [ ] 重跑同一命令得到 PASS；对照任务 1 的快速检索冻结记录，确认返回/调用契约无变动。

**Done:** deep 可证明没有查询 Embedding 应用重试；上传仍按现有配置恢复瞬时故障。

## 任务 4：三轮有界编排与证据选择

**Files:** Create `server/src/chat/deep-book-context.service.ts`、`deep-book-context.service.spec.ts`；Modify `server/src/chat/chat.module.ts`。

**Interfaces:**

```ts
run(context: BookChatContext, query: string, signal: AbortSignal, runId?: string): AsyncGenerator<DeepBookEvent>;
```

消耗任务 2 的类型/model、任务 3 的 retrieve、现有 sessions.getRecentMessages。使用 run 入口 signal；由聊天层组合在线期限，服务内另设 60 秒编排期限。

- [ ] 写失败测试 `first_round_satisfied_stops`、`second_round_fills_missing_evidence`、`three_round_cap`、`duplicate_queries_stop`、`unchanged_corpus_stops`、`empty_corpus_returns_incomplete`。spy 断言 plan≤1、check≤3、retrieve≤3、queries≤9；结果恰好一次，最多八块/12,000 字符。
- [ ] 运行 `npm test -- --runInBand deep-book-context.service.spec.ts`，确认 RED。
- [ ] 实现设计第 4 节确定性选择与停止优先级：首轮含原问题；累计候选 chunkId 去重；不比较跨轮 score；上一轮支持按子问题轮询保留，按轮内排名填充、章节/重叠/字符约束后重新检查。
- [ ] 添加 `evicted_support_is_rechecked`、`all_rounds_keep_identical_boundary`、`changed_book_is_rejected`、`timeout_leaves_no_new_calls`、`late_nonabortable_result_is_discarded`、`one_branch_failure_never_yields_result`、`heartbeat_stops_after_abort`。假时钟证明 60 秒超时、10 秒 heartbeat；对迟到 Promise 保留 catch/finally，清计时器。
- [ ] 重跑该 spec，全部 PASS；确保异常不发 result，正常有限证据发 incomplete=true，不自动回落 quick。

**Done:** 编排的全部停止路径可确定性验证；身份与可见范围不由模型重建。

## 任务 5：接入聊天、租约、生成与落库

**Files:** Modify `server/src/chat/dto/chat.dto.ts`、`chat.controller.ts`/`.spec.ts`、`book-chat.service.ts`/`.spec.ts`、`book-sessions.service.ts`/`.spec.ts`；使用现有服务完成最终作用域复核，不修改 schema。

**Interfaces:** ChatDto 增加可选枚举 `retrievalMode`；BookChatRunOptions 增加 `retrievalMode?: RetrievalMode`、`runId?: string`、`spoilerOverride?: boolean`。BookChatEvent 增加 `{type:'run_summary';data:DeepRunSummary}`。`appendExchange(context,query,response,signal?:AbortSignal):Promise<void>` 增加可选第四参数。controller 把 lease.runId 和本次已验证的 spoilerOverride 透传；最终复核调用 `sessions.resolve(context.ownerId, context.sessionId, options.spoilerOverride === true)`，仅比较授权与生命周期，不扩张原 boundary。

- [ ] 写失败测试 `missing_mode_keeps_quick_flow`、`deep_rejects_external_before_admission`、`deep_rejects_email_before_sse`、`invalid_mode_returns_400`、`deep_never_invokes_quick_planner_or_memory_model`。直接邮件检测复用同一纯函数/策略，不复制第二份匹配规则；必要时从现有私有 helper 提取并覆盖原测试。
- [ ] 运行 `npm test -- --runInBand chat.controller.spec.ts book-chat.service.spec.ts book-sessions.service.spec.ts`，确认 RED。
- [ ] 接入 deep `for await`，转发 thinking、唯一 summary，再发最终 selected 引用并生成。deep 独立 Chat client 使用相同 provider/model 与 maxRetries=0、20 秒、2,400 输出 tokens；不改变 quick client。复用提示词风格/详略，但注入经标记的证据缺口约束，不调用外部工具或长期记忆服务。
- [ ] 自租约接受起建立 90 秒在线 deadline；生成前复核 owner/book/version/READY/范围收紧。权限/版本变动抛 BOOK_CONTEXT_CHANGED；期限抛 DEEP_MODE_TIMEOUT；结构错误与其他错误按设计稳定 code 映射，日志只记 runId 与阶段指标。
- [ ] 添加 `one_lease_and_one_terminal_event`、`cancelled_generation_does_not_append`、`abort_after_history_lock_prevents_update`、`version_change_before_generation_fails`、`tightened_progress_fails`、`increased_progress_does_not_expand_scope`、`explicit_override_keeps_original_authorized_ceiling`。测试 provider/DB 全 mocks。
- [ ] 成功仅 appendExchange 一次；取消在锁后、DB 更新前检查。记录 DB 已提交后收到取消不可逆的边界。深度不执行 storeMemory。先存在的快速行为通过回归证明保留。
- [ ] 重跑同一命令及任务 2–4 的 specs，PASS；检视 failure code 与 admission finalStatus 一致，所有 timer 清理。

**Done:** 可通过 HTTP 选择 deep，快速兼容；取消与终态、引用与落库契约可验证。

## 任务 6：共享输入入口、状态与陈旧请求隔离

**Files:** Modify `client/src/components/BookChat/components/InputArea.tsx`/`.test.tsx`、`client/src/components/BookChat/components/MessageBubble.tsx`、`client/src/store/useChatStore.ts`、`useChatStore.view.test.ts`、`client/src/components/BookReader/components/ReaderAssistantPanel.test.tsx`；Create `client/src/components/BookChat/components/MessageBubble.mode.test.tsx`；必要时仅增加局部样式。

**Interfaces:** store `sendMessage(content,spoilerOverride?,externalResearch?,retrievalMode?:'quick'|'deep'):Promise<void>`，前三参数兼容；Message 增加可选 `runSummary`。模式为下一次提问选项，不持久化至 assistant/schema。

- [ ] 写失败测试 `default_request_is_quick`、`deep_selection_submits_mode_and_disables_web`、`submission_resets_mode`、`session_or_book_change_resets_pending_mode`、`reader_uses_same_composer`、`bubble_displays_limited_evidence_summary`。请求 spy 断言旧前三参数调用仍有效；summary 不存在时保持旧 MessageBubble 展示。
- [ ] 在 client 运行 `npm test -- src/components/BookChat/components/InputArea.test.tsx src/components/BookChat/components/MessageBubble.mode.test.tsx src/store/useChatStore.view.test.ts src/components/BookReader/components/ReaderAssistantPanel.test.tsx`，确认 RED。
- [ ] 实现本次模式单选与说明，loading 禁止更改；切模式取消联网选择，发送后恢复 quick。切会话/书和 unmount 清除局部待发选项。保留详略设置，不把 mode 写入 responseDepth。
- [ ] 解析新增 summary，归属于当前消息；展示有限依据提示和固定进度文案。未知额外 SSE 字段保持兼容；error 可附 code 但保留现有字符串展示。
- [ ] 添加 `heartbeat_prevents_30s_inactivity_abort`、`stop_cancels_deep`、`late_summary_does_not_touch_new_session`、`late_memory_event_does_not_touch_new_book`、`terminal_event_finishes_once`。所有 SSE 事件在应用状态前校验 activeRequestId，不只保护 content。
- [ ] 重跑上述命令得到 PASS；用键盘操作选项、发送、停止，核对桌面聊天与阅读器窄面板可用。

**Done:** 用户可选深度并停止；不会因等待静默超时或旧响应覆盖新书。

## 任务 7：离线回归与固定题集回放

**Files:** Create `server/test/fixtures/deep-reading-mode.json`、`server/test/deep-reading-evaluation.ts`、`server/test/run-deep-reading-offline.ts`、`server/src/chat/deep-book-acceptance.spec.ts`；更新 `docs/deep-reading-mode-acceptance.md`。

**Interfaces:** evaluator 导出 `evaluateDeepReadingCase(fixture, replay): EvaluationRow` 及 `summarizeDeepReadingRows(rows): EvaluationSummary`；fixture 含 id/category/split/history/ceiling/subquestions/evidenceGroups/expectedFacts/forbiddenFacts 和许可说明。replay 为已脱敏结果，不接受数据库连接或任意工具地址。

- [ ] 建立设计第 8 节 120 题的合成/获准 fixture、40/80 分层划分和独立的失败轨迹。写 evaluator 的手算分组覆盖、空分母、重复运行按题聚合、迟到事件及调用计数测试。
- [ ] 运行 `npm test -- --runInBand deep-book-acceptance.spec.ts`，确认 RED；不得因引入 fixture 就调用真实模型。
- [ ] 实现离线 evaluator 与确定性 replay runner；读固定文件和输出脱敏 JSON，不导入 AppModule/PrismaClient/ConfigModule，不加载 .env，不接网络。测试中用 hard-fail transport 证明零外部调用。
- [ ] 在 server 执行 `node -r ts-node/register test/run-deep-reading-offline.ts --fixtures test/fixtures/deep-reading-mode.json`。退出 0 仅代表工程不变量/回放评分通过；报告明确 `liveQualityVerified=false`，不能冒充真实模型质量。
- [ ] 对同一查询回放 dense/BM25/hybrid、首轮/完整循环；验证 evaluator 输出逐题改善/退化，RRF 分数不解释为置信度。相同查询消融与 B0/B1/B2 报告分开。
- [ ] 重跑 acceptance spec，PASS；写明 fixture hash 与离线证据路径，live 栏保持待验收。

**Done:** 安全、预算、编排轨迹可离线验收；效果指标计算可复现，尚未宣称真实增益。

## 任务 8：隔离真实集成与效果评测入口

**Files:** Create `server/test/deep-reading-target-guard.ts`、`server/src/chat/deep-reading-target-guard.spec.ts`、`server/test/run-deep-reading-live.ts`；更新 `server/README.md` 和验收记录。不得直接运行现有 reader E2E。

**Interfaces:** `assertDeepReadingTargets(env: Record<string,string|undefined>, serverFingerprint: unknown): SafeDeepReadingTargets` 先校验目标，不构造客户端；专用 runner 支持 `--preflight` 只读检查与 `--run` 获准后执行。环境变量仅由调用者显式提供，不修改仓库 .env。

验收专用进程输入包括 `TEST_DATABASE_URL`、`TEST_MILVUS_COLLECTION`、`TEST_MILVUS_MEMORY_COLLECTION`、`TEST_UPLOAD_DIR`、`TEST_API_BASE_URL`、`DEEP_READING_SERVER_FINGERPRINT_FILE` 与三个预算。实际变量、文件结构与操作顺序见[验收记录](../../deep-reading-mode-acceptance.md)。生产目标仅用于比对；书籍和记忆集合均隔离。指纹文件不含密码/token，必须由受控测试启动过程产出，并与实际进程 PID/启动配置相互印证；没有这一证据则 preflight 拒绝。

live runner 默认验收集 80 题 × 三次；B0 读取同题集冻结输出，B1/B2 各发 240 次聊天，共 480 次在线聊天。每次另创建会话，加上身份、书籍与进度预检，共需 967 次 API 请求；开发集通过 `--split development` 单独执行，不能混入验收。provider transport 预算在专用服务进程拦截并扣减，覆盖 B1 原有 Planner、记忆与实际 Embedding 批次，不把深度五次上限等同于全部模型次数。费用由调用者按当前 provider 与可接受额度核算。受控服务关闭索引 worker，因此依赖事先准备好的合成 READY 书籍；不会自动导入、清理或消费其他任务。

- [ ] 写失败测试：missing URL、非 *_test DB、非 test_* schema、生产目标相同、schema 默认解析、端口默认解析、向量集合相同、上传路径相同/不受控、API fingerprint 不匹配、worker fingerprint 缺失全部拒绝，拒绝时零网络模型/DB写调用。
- [ ] 运行 `npm test -- --runInBand deep-reading-target-guard.spec.ts`，确认 RED。
- [ ] 实现目标门禁与 preflight；API/worker 的指纹必须来自部署启动信息或受控测试进程配置，并包含对所核验目标一致性的证据，不接受单独的客户端声明替代。不要开放生产 HTTP 配置/秘密接口。
- [ ] 实现 live runner：验证预备合成书籍全文、归属和 READY 状态，只创建本轮会话；固定题集比较冻结 B0 和在线 B1/B2 各三次，输出逐题耗时、错误和 transport 计数，供人工计算 p50/p95 及盲评。取消、故障和进度变更当前以 mock 回归证明，真实链路仍待验收；不得冒充已执行的真实用例。B0 不新增生产检索切换参数。
- [ ] 重跑 guard spec PASS。运行前先阅读 runner 本次源码及实际服务配置；用脱敏目标指纹、最大请求/模型调用量、预计费用上限和 fixture 许可取得本次真实调用授权。若无法估价，先声明用调用数/token 上限，并让调用者指定可接受费用；不能擅自启动 1,080 次全量请求。
- [ ] 获准且具备目标后，在 server 运行 `node -r ts-node/register test/run-deep-reading-live.ts --preflight`；通过后运行 `node -r ts-node/register test/run-deep-reading-live.ts --run`。分别填写集成硬门、工程成功率与质量阶段门。任何一步隔离无法证明就停止，留未验收证据。
- [ ] 不自动清理 fixture；需要清理时另核对 owner/book/version/prefix、预期影响和本轮授权，仅按指定 ID 清理，禁止全表或全集合清理。

**Done:** 可安全运行真实验收；若环境或授权缺失，runner 与门禁仍交付，报告准确标记真实验收未完成。

## 任务 9：质量门、文档与交付审查

**Files:** Update `server/README.md`、`client/README.md`、`docs/deep-reading-mode-acceptance.md`；必要时按实际实现纠正本设计和计划，不改无关文档。

- [ ] 按任务 1 重新核验当前默认测试发现范围与环境安全性；安全后运行 server `npm run check`、client `npm run check`。必须成功退出；已有无关失败报告原因和证据，不修改无关代码清场。
- [ ] 检查 quick 基线、deep 总计数、失败码、Prompt 信任层次、最终引用与 runtime skill 导入边界。用新增 acceptance spec 和既有边界测试证明 deep 不越权。
- [ ] 文档同步请求示例、第一版组合限制、模式与详略区别、停止/取消语义、真实环境安全门和验收命令；预算只链接设计事实源。
- [ ] 执行 `git diff --check`；查看 git status 与仅本轮文件的 diff，排除凭据、私人路径、fixture 私人正文、运行产物和无关改动。人工按设计逐条审查，不把所有断言写成“模型应该会”。
- [ ] 完成报告，必须区分“工程实现通过”“真实集成通过”“质量效果通过”。未运行项列原因；未达效果门不称深度方案已证明更优。交付文件清单与可复现命令，不提交或部署。

**Done:** 交付可执行成果与准确验收状态；代码完成不替代效果证明。

## 最终验收表模板

| 验收项 | 完成证据 | 通过条件 | 状态 |
| --- | --- | --- | --- |
| 快速兼容 | 冻结 B1 + 请求/Planner/引用回归 | 既有默认行为保持 | 待执行 |
| 深度闭环 | 一轮/二轮/三轮轨迹 | 调用及停止码符合设计 | 待执行 |
| 隔离与注入 | 查询过滤、Prompt 捕获、工具 spy | 未授权内容/调用为 0 | 待执行 |
| 取消与期限 | 假时钟 + 迟到 transport + UI | 后续调用/落库/陈旧更新为 0 | 待执行 |
| 失败语义 | fault injection、SSE/lease 记录 | 错误可见、无 fallback、终态一次 | 待执行 |
| 包质量门 | server/client check 输出与 exit code | 两包全部通过或准确披露阻碍 | 待执行 |
| 隔离真实集成 | 指纹、获准调用记录、集成报告 | API/worker/DB/vector 目标一致且硬门全过 | 待执行 |
| 实际质量增益 | 冻结题集 B0/B1/B2 盲评、逐题/区间 | 设计 8.2 效果阶段门达标 | 待执行 |
| 隐私与最小改动 | 文件范围、diff 审查 | 无私有数据/配置/无关变更 | 待执行 |

## 计划自审结论

设计的 HTTP/UI 契约对应任务 5–6；模型与预算对应任务 2–5；查询隔离与引用对应任务 3–5、7；可观测性对应任务 5；基线与效果评测对应任务 1、7–8；外部门禁和交付对应任务 8–9。工程实现已执行，未增加生产依赖或工具授权。真实集成、同查询召回消融、模型质量盲评与真实费用统计尚未完成；以[验收记录](../../deep-reading-mode-acceptance.md)的证据及限制为准，不能由模板中的通过条件推断已达标。
