# Agentic RAG 深度模式修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:executing-plans 逐项执行；当前用户只要求制定计划，不在本轮改产品代码。保留工作区，未经要求不建分支、提交、push 或部署；不默认委派。

**Goal:** 深度模式保留助手记忆和授权工具，按需补检，提高可用性及有依据的准确率，而非固定增加思考步骤。

**Architecture:** 复用当前聊天、租约、混合检索及确定性初始化规则；使用现有 ChatOpenAI 原生工具调用实现有界 Agent 循环。移除独立 JSON plan/check 主链路，联网继续使用隔离路由，邮件仍只生成可确认草稿。

**Tech Stack:** 当前 NestJS/TypeScript、LangChain/OpenAI 兼容 provider、zod、Prisma、Milvus、React/Zustand、Jest/Vitest；npm；无新增生产依赖。

**Spec:** [修正设计](../specs/2026-10-06-agentic-reading-revision-design.md)。执行者先读设计、AGENTS.md 与[既有验收记录](../../deep-reading-mode-acceptance.md)。此前书内 hybrid 已存在，不能按新项目重建索引。

## Global Constraints

- 默认 quick，quick 主路径及 responseDepth 契约不变；deep 不再禁用记忆、授权联网和邮件草稿。
- owner/book/session/version/ceiling 来自服务端，所有检索轮次冻结作用域；原文只从当前可见 BookChunk 获取，Milvus 与 BM25 的统计/生命周期不变。
- 采用设计第 5 节唯一预算：90 秒在线、最多 4 主模型回合、最多 3 主 Agent 工具执行、3 次书内检索/9 个查询文本、最多 2 次记忆召回、1 次隔离联网路由、1 次草稿、1 次门控；原文 8 块/12,000 字符，输入 40,000 字符。
- 新模型单次期限 min(当前 openai.requestTimeoutMs，30 秒，剩余时间)；保留 30 秒回答窗口，不设固定 5 秒；maxRetries=0，无模型/模式切换。
- 不新增供应商/配置/.env/数据库 schema；不把工具发现当作授权，不导入其他 Agent/Skill，不开放原始通用 MCP 工具。
- 基于 SDK native tool_calls + schema 校验，不解析自由文本 JSON 决策；工具消息/原文/历史均为不可信数据。
- 不日志记录私人文本、完整异常或工具参数；不将模型工具回合、模型回答或工具输出写为记忆。
- 默认测试零真实外部调用；真实评测必须核验独立数据库、两个向量集合及服务指纹并获准费用。不得自动迁移、上传私人书、删数据或复用开发库。

## Review Focus

1. provider 8 秒才回复：简单题仍成功，超时日志精确到 agent/tool 阶段。（任务 4、6）
2. 同一模型回合同时有 text 和 tool_calls：中间内容不进入 UI、历史或记忆。（任务 4、5）
3. tool_calls 含恶意 owner/book/ceiling、重复调用或未知 MCP 工具：执行前拒绝，零越权/重复副作用。（任务 3、4）
4. 主 Agent 已见私人正文后要求联网：外部路由只见原问题与书名，私人资料与自由搜索词不外流。（任务 2、3、4）
5. 记忆落库后取消或派生向量变慢：不再启动新的后续写入，已提交状态不伪装回滚或全部成功。（任务 3、5）

## 文件与职责

| 文件 | 职责 |
| --- | --- |
| `server/src/chat/book-context-planner.service.ts` | 暴露纯规则初始化入口，原 plan 保留 quick 模型策略 |
| `server/src/chat/book-external-research-agent.service.ts`（新增） | 提取现有隔离联网路由，quick/deep 共用，原文/记忆不可进入 |
| `server/src/chat/agentic-book.types.ts`（新增） | 运行预算、状态、工具错误与最终事件类型 |
| `server/src/chat/agentic-book-tools.service.ts`（新增） | 固定工具适配器与可信作用域注入，不能决定总流程 |
| `server/src/chat/agentic-book.service.ts`（新增） | native tool-call 循环、停止、证据池、最终回答与引用 |
| `server/src/chat/book-chat.service.ts` | 模式分支、共用回复策略、历史和记忆门控，无第二套业务入口 |
| `server/src/chat/deep-book.types.ts` | 保留公开 summary/error/deadline 兼容；移除旧专属计划类型及预算 |
| `server/src/memory/memory.service.ts` 与 repository | 兼容的 signal 透传、阶段前后取消检查，沿用当前 gate 与 owner/book 查询 |
| controller/前端 store/输入/气泡 | 恢复组合能力、心跳与真实状态，兼容原 SSE |
| `server/test/` 既有 deep 评测文件 | Q/D0/D1 新基线、工具 smoke、provider 真实兼容与指标；不新增生产切换参数 |

相邻 `.spec.ts` 覆盖每个单元。生产不使用旧 `agent/` 或 `rag/` 入口，不修改 schema、McpService allowlist、SMTP 投递协议或索引 worker。

## 顺序和执行契约

任务 1 → 2 → 3 → 4 → 5 → 6。每项测试先 RED 再最小实现/GREEN，保留历史回归；仅 doc 变更不跑无意义构建。以下服务端命令在 server/ 运行、客户端在 client/，先做安全发现检查。npm shim 失效时使用已核验的现有 npm CLI，仅修当前进程 prefix，不写系统配置。

### 任务 1：冻结现场与验收用例

**Files:** Read 两包 package.json、默认 Jest/Vitest 范围、现有 chat/deep/memory/MCP 测试；Create `docs/agentic-reading-revision-acceptance.md`、`server/test/fixtures/agentic-reading-smoke.json`；Modify `server/src/chat/deep-book-acceptance.spec.ts`。

**Interfaces:** smoke 使用稳定 id、category、固定 history/ceiling、expectedToolNames、allowedTools、evidenceGroups、禁止泄漏项及模型调用上限；只含原创合成文本。记录开工 Q/D0 文件 hash、模型配置来源（不抄密钥）、现有未提交差异。

- [ ] 记录 git status、目标文件 hash 与差异；核验子目录规则、默认测试不会触发 DB/vector/provider。以 `npm test -- --listTests` 只读确认 DB spec 排除，不读取/输出 .env。
- [ ] 建立 24 题 smoke（类别数量以设计第 7 节为准），包括“主角是谁/主人公是谁”、不存在人物、书中不唯一主角、追问指代、偏好、确认记忆、联网许可及邮件草稿；证据全部在固定可见章节，人工审题。
- [ ] 对 fixture 验证写失败测试 `smoke_requires_visible_evidence_and_explicit_permissions`：未知证据、未来章节、工具许可缺失必须拒绝，不能把词条命中当语义正确。
- [ ] 运行 `npm test -- --runInBand deep-book-acceptance.spec.ts`，确认新增约束 RED；实现纯 validator 后 GREEN，零网络/DB。
- [ ] 验收表初始分为工程待测、真实未运行、效果未运行；不要将旧 706 项测试结果写为新实现通过。

**Done:** 可安全执行后续测试，Q/D0 基线和用户失败场景可追溯，题集许可与可见依据明确。

### 任务 2：复用确定性初始化与隔离联网

**Files:** Modify `book-context-planner.service.ts`/`.spec.ts`、`book-chat.service.ts`/`.spec.ts`、`chat.module.ts`；Create `book-external-research-agent.service.ts`/`.spec.ts`（均在 server/src/chat/）。

**Interfaces:** `planRules(input: BookContextPlanningInput): BookContextPlan` 完全无模型调用；现有 `plan(input)` 仍使用同一规则并保持 quick 原回归。新增 `BookExternalResearchAgentService.research(bookTitle:string, originalQuery:string, signal?:AbortSignal):Promise<ExternalResearchAgentResult>`；导出原 context/messages 结果类型，参数不允许原文、历史、记忆或任意工具地址。

- [ ] 新增失败测试 `rule_plan_for_simple_lookup_never_invokes_provider`、`rule_plan_preserves_follow_up_and_memory_policy`，以及 `external_agent_only_receives_original_question_and_title`。捕获消息验证无私有原文/记忆/历史/邮箱、只绑定 Tavily、拒绝多调用。
- [ ] 运行 `npm test -- --runInBand book-context-planner.service.spec.ts book-chat.service.spec.ts book-external-research-agent.service.spec.ts`，确认新增接口/边界 RED。
- [ ] 从现有 deterministicPlan 提供公开 planRules，不能复制分类正则；把原 invokeExternalResearchAgent 及其 deadline 移入新服务，quick 改委托而保持结果和调用顺序，不改变既有联网失败策略。
- [ ] 重跑同命令 GREEN，既有 quick 工具拒绝、搜索参数和默认请求回归全通过。

**Done:** deep 能初始化查询/记忆而不调用 Planner 模型，联网复用同一隔离入口；没有平行搜索路由。

### 任务 3：受控工具与记忆取消边界

**Files:** Create `agentic-book.types.ts`、`agentic-book-tools.service.ts`/`.spec.ts`；Modify `server/src/memory/memory.service.ts`/`.spec.ts`、`server/src/memory/repositories/memory-entry.repository.ts`/`.spec.ts`，仅增加兼容 signal；必要的 memory persist/storeToMilvus 私有 helper 透传同一 signal。

**Interfaces:**

```ts
interface AgenticToolPermissions { externalResearch: boolean; emailDraft: boolean }
interface AgenticToolResult {
  code: 'OK' | 'NOT_FOUND' | 'INVALID_TOOL_ARGUMENTS' | 'MULTIPLE_TOOL_CALLS' | 'TOOL_UNAVAILABLE' | 'BUDGET_EXHAUSTED';
  data: unknown; // 经各工具具体 schema 校验后消费，不能直接视为可信原文
}
createTools(context: BookChatContext, originalQuery: string,
  permissions: AgenticToolPermissions, signal: AbortSignal,
  execute: (name: AgenticToolName, args: unknown) => Promise<AgenticToolResult>): StructuredToolInterface[];
execute(context: BookChatContext, originalQuery: string, name: AgenticToolName,
  args: unknown, permissions: AgenticToolPermissions, signal: AbortSignal): Promise<AgenticToolResult>;
```

`AgenticToolName` 固定为设计第 4 节四个名称；实际导入现有 SDK 的 StructuredToolInterface 类型，不能新增弱 any。execute 返回工具特定 schema 和现有 RetrievedBookChunk/AgentMemoryContext/ExternalResearchAgentResult/PreparedEmailDraft；循环在执行回调扣减总预算，不能仅让工具自己计数。邮箱配置放在服务端运行上下文，不允许模型提交 accountEmail。

`buildBookAgentContext(...既有参数, signal?:AbortSignal)`、`processAndStoreBookMemory(...既有参数, signal?:AbortSignal)` 与必要 repository 方法增加可选末参数，旧调用完全兼容；getForBookContext 保留查询层 owner/book 过滤。

- [ ] 写失败测试 `scoped_search_ignores_no_scope_arguments`（传 owner/book 字段应 schema 拒绝而非忽略）、`foreign_tool_is_rejected_before_execution`、`memory_recall_uses_confirmed_current_scope`、`external_is_absent_without_current_permission`、`external_cannot_receive_agent_generated_query`、`email_only_prepares_draft`、`abort_before_memory_write_and_after_embedding_prevents_next_side_effect`。
- [ ] 运行 `npm test -- --runInBand agentic-book-tools.service.spec.ts memory.service.spec.ts memory-entry.repository.spec.ts` 确认 RED。
- [ ] 实现工具严格 schema 和授权闭包；书籍 scope 不能从 args 构造。记忆最多 5 条/2,500 字符，外部工具空 args 复用任务 2；prepare_email 复用既有工具而非真实发送。读取为空返回 NOT_FOUND；不可用/授权错误保持可区分。
- [ ] 兼容透传 memory signal，检查 score/查询/锁/写库/embedding/upsert 前后；不在 catch 中吞掉取消，不记录 String(error)。先存在的提交不回滚；默认调用不传 signal 时不改 gate/去重。
- [ ] 对 deep 的派生记忆 Embedding 使用独立 maxRetries=0 client（同一现有 provider/config，最多一个输入/一次请求），不能临时修改共享 embeddings 实例；quick 保留当前 maxRetries=1。加入 `deep_memory_embedding_has_no_sdk_retry_and_does_not_mutate_quick_client` 的 fake transport RED/GREEN 回归，计入真实评测全部 transport 预算。
- [ ] 重跑同命令 GREEN；同时跑既有 tools/tavily-search.tool.spec.ts、tools/prepare-email.tool.spec.ts，确认未授权事件不能启动 MCP/SMTP/DB 写入。

**Done:** 已有能力可安全调用，模型不能指定身份、范围或新工具；迟到记忆流程不能继续副作用。

### 任务 4：原生 Agent 循环与一次即可回答

**Files:** Create `server/src/chat/agentic-book.service.ts`/`.spec.ts`；Modify `deep-book.types.ts`（兼容 error/summary/deadline）与 `chat.module.ts`；复用 retriever、任务 2–3 的接口。

**Interfaces:** `AgenticBookService.run(context:BookChatContext, query:string, options:BookChatRunOptions):AsyncGenerator<BookChatEvent>`；内部不落历史/记忆。主模型同一现有 provider/model，native bindTools，maxRetries=0；budget/state 单一实例包含模型回合、工具执行、book 次数、query 文本数、memory 次数、外部/邮件次数、executedQueries、candidate pool、deadline 与 stopReason。

- [ ] 写失败轨迹 `simple_lookup_one_retrieval_one_model_no_plan_check`、`social_uses_no_book_retrieval`、`empty_initial_evidence_can_trigger_rewritten_search`、`cross_passage_gap_triggers_only_needed_second_search`、`same_queries_and_unchanged_evidence_stop`、`eight_second_first_response_is_not_killed_at_five_seconds`。每条断言真实模型/工具调用计数、输入 scope、最终引用和停止状态，不断言模型逐字文本。
- [ ] 写安全轨迹 `tool_text_is_not_final_answer`、`one_tool_per_turn_and_one_argument_repair`、`unknown_or_unpermitted_tool_fails_closed`、`memory_and_external_budgets_include_bootstrap`、`last_turn_has_no_tools`、`abort_discards_late_results`、`remaining_time_reserves_final_answer`、`evicted_excerpt_is_absent_from_all_next_prompts`。
- [ ] 运行 `npm test -- --runInBand agentic-book.service.spec.ts` 确认 RED。
- [ ] 实现设计第 3 节：planRules 初始化、必要的书检索/记忆，主模型 native 工具回合；每回合聚合完整 AIMessage/tool_calls，带工具的中间 text 丢弃。合法工具结果和固定错误构造对应每个 tool_call_id 的 ToolMessage；拒绝缺失/重复 ID，不遗留无结果调用。最多一次参数修正，不重试外部调用。
- [ ] 复用/迁移旧证据选择算法：ID/offset/章节/字符限制；各轮按排名合并而非比较 score。工具消息保留固定元数据，重新构造单一当前证据 envelope，避免旧正文留在对话里。重复/无新证据或≤30 秒剩余时停止补充，只用最后无工具回合回答。
- [ ] 最终答案及引用展示前 resolve 复核版本/READY/owner/ceiling 收紧；普通进度增加不扩范围。无证据明确说明，无原文不能以记忆/联网补小说事实。空回答、超时、非法 tool_calls、检索失败仍错误，所有超时注明固定阶段。
- [ ] 重跑 GREEN，并运行现有 book-chunk-retriever.service.spec.ts、book-vector-store.service.spec.ts、book-embedding.service.spec.ts，证明复用检索与取消语义未退化。

**Done:** 一个模型回合可以直接结束；多回合仅由工具需要驱动，无独立 plan/check；全部上限可证明，首字缓冲成本有记录。

### 任务 5：接回完整聊天能力与前端

**Files:** Modify `server/src/chat/book-chat.service.ts`、`chat.controller.ts`、`chat.module.ts` 及各 `.spec.ts`；新建 `agentic-book-chat.spec.ts`；Modify `client/src/components/BookChat/components/InputArea.tsx`/`.test.tsx`、`MessageBubble.tsx`/`MessageBubble.mode.test.tsx`、`client/src/store/useChatStore.ts`/`useChatStore.view.test.ts`；相关 README。

**Interfaces:** 仍使用 BookChatRunOptions 和 BookChatEvent；controller 为 deep 透传本次 externalResearch/accountEmail/override/runId/signal，不改变 ChatDto scope。BookChatService 委托任务 4，成功一次 appendExchange（signal），以原始消息处理一次记忆门控；不是模型记忆写工具。主循环结果提供服务端确认的答复/草稿和可见引用；持久化仍由聊天服务负责。

- [ ] 写失败测试 `deep_supports_authorized_external_and_email_without_400`、`no_permission_no_mcp`、`deep_reuses_memory_gate_once`、`ordinary_question_has_no_memory_write`、`explicit_remember_reports_actual_result`、`abort_prevents_append_and_memory_commit`、`final_summary_does_not_claim_evidence_certification`、`failed_run_never_shows_completed_retrieval`。
- [ ] server 运行 `npm test -- --runInBand agentic-book-chat.spec.ts chat.controller.spec.ts book-chat.service.spec.ts book-sessions.service.spec.ts`；client 运行 `npm test -- src/components/BookChat/components/InputArea.test.tsx src/components/BookChat/components/MessageBubble.mode.test.tsx src/store/useChatStore.view.test.ts src/components/BookReader/components/ReaderAssistantPanel.test.tsx`，确认新增要求 RED。
- [ ] 移除 deep 的联网/邮件组合拒绝和前端禁用；保留联网本次授权及发送重置。引用仅最终可见证据，保留既有 SSE 事件、memoryUpdate/草稿及一个终态；用户停止、requestId 保护不变。
- [ ] 成功后 memory gate 用原用户消息执行，取消/失败不调用；普通问答先用现有 scorer 确认不够资格再不写入。显式记住的反馈只在真实 gate 结果后发出；工具回合/模型文本不保存。门控失败显式通知，无假 memoryUpdate、无完整异常日志。
- [ ] 保留兼容 summary：有检索时 1–3 轮，纯闲聊/记忆省略可选 summary；文案不宣称“已完成证据检查”。前端错误从 error 状态呈现，不能因为结束而显示“已完成检索”。
- [ ] GREEN 后移除已不使用的 deep-book-model.service.ts、deep-book-context.service.ts 与其专属测试/注入；安全回归迁入新 specs 再删除旧专属文件，不以删除测试消除失败。旧 deep-book-chat.spec.ts 替换为新等价安全轨迹；deep-book.types.ts 保留公共兼容部分，不留第二条 deep 运行路径。

**Done:** 书籍聊天与阅读器 deep 全能力可用；原 quick 回归不变，历史/记忆/工具事件无重复副作用。

### 任务 6：真实 smoke、质量对照与交付

**Files:** Modify `server/test/run-deep-reading-live.ts`、`deep-reading-evaluation.ts`、`start-deep-reading-acceptance.ts`、`deep-reading-provider-budget.ts` 及相邻 src/chat 回归；Update `docs/agentic-reading-revision-acceptance.md`、`server/README.md`、`client/README.md`；旧验收记录追加被替代说明，不重写历史结果。

**Interfaces:** 原独立环境 guard 继续使用；新增 `--suite smoke|acceptance`，报告按 Q/D0/D1 与 category 分组，提供成功率、firstContentMs、总时间、toolCalls、providerAttempts、embeddingTexts、错误 stage/reason、证据 ID、人工盲评待审项；D0 冻结回放不得混入新线上耗时。fixture hash、sourceHash、模型版本/预算配置固定；B0 纯向量历史评测不改名冒充 Q。

- [ ] 对 parser/报告写失败测试 `stream_without_done_is_failure`、`draft_and_memory_events_are_evaluated`、`baselines_are_summarized_separately`、`first_content_time_excludes_heartbeat`、`runtime_tool_compatibility_failure_is_not_quick_fallback`、`mcp_and_smtp_are_fake_by_default`；运行对应定向 Jest RED → 实现 → GREEN。
- [ ] safe provider fake-transport 回归验证：native tool_calls 合并及参数/schema、工具出错、8 秒首响应、每次实际 HTTP 计数、embedding 拆批、零隐藏重试、取消后零新请求；不能仅 spy 逻辑服务。默认测试不读取 .env 或启动实际服务。
- [ ] 更新 live runner：支持 24 题 smoke 和冻结 80 题验收各三次；Q/D1 在线、D0 回放。创建本次独立会话、写同一合成历史和预备记忆 ID；初始化及恢复进度只作用于已匹配全文的测试书，不清表。网络/邮件类先使用受控 fake MCP/SMTP 和明确授权选择，真实 tool provider 另行授权。
- [ ] 给出 preflight 显示的精确 HTTP/模型预算：由所选 suite、重复次数、在线基线数和实际 fixture 初始化动作计算，校验调用者预算不足时在任何写入前拒绝；不再用固定“967 请求”覆盖增加后的记忆/工具场景。所有 fixture 改动按稳定 ID 记录，未经授权不自动清理。
- [ ] 审核测试发现与实际环境安全后运行 server/client `npm run check`；记录 exit code、套件和测试数。未做相关前端行为改动时不无故重跑，但此任务跨前后端必跑两包。
- [ ] 先独立目标 preflight；获准真实模型调用后执行 smoke，确认 native tools 支持及用户简单题可用。smoke 未通过不跑大规模验收，不宣称 deep 可发布；不以提高预算、换模型、禁用工具让报告变绿。
- [ ] 真实 smoke 通过后，开发集用于定位改进；审定冻结题集并执行 Q/D1 各三次，人工盲评全部改善/退化及安全用例。按设计第 7 节统计效果门、分位延迟、配对区间；关键词命中和标准答案评分自检不等于语义准确率。
- [ ] 若外部隔离/费用未具备，交付脚本与工程结果，真实 smoke/工具链路/准确率保留未验收。不能拿 mock/tool schema 测试声称 provider 真实支持或“可靠”。
- [ ] 查看本轮 diff/status、`git diff --check` 和文档链接；交付变更文件、工程证据、真实报告/缺失原因及剩余风险。未经指令不提交/部署/清理数据。

**Done:** 工程能力与真实可用性分别有证据；只有 smoke 和质量门达标才声称可靠/提高准确率。

## 最终验收表

| 验收项 | 证据 | 当前状态 |
| --- | --- | --- |
| 简单题短路径 | 一次检索/一次主模型、8 秒响应轨迹 | 待执行 |
| 按需 Agentic 补检 | 原生 tool_calls、缺口补检/无进展/预算轨迹 | 待执行 |
| 完整助手能力 | 当前书记忆、授权 MCP、邮件草稿及 gate 反馈 | 待执行 |
| 权限/防剧透/取消 | scope/提示词注入/断流/重复副作用拒绝回归 | 待执行 |
| 两包质量门 | lint/typecheck/default tests/build exit 0 | 待执行 |
| provider 与真实 smoke | 原生工具兼容、简单题/记忆/工具实际成功 | 未运行 |
| 准确率和延迟 | Q/D1 冻结对照、独立盲评、改善/退化及区间 | 未运行 |

## 自审与执行方式

设计 1–3 节对应任务 1–2、4；工具/记忆边界对应任务 2–3、5；预算/失败对应任务 3–5；SSE/UI 对应任务 5；评测/回退对应任务 6。Review Focus 各有归属与具名测试。schema、配置和生产依赖不变；无任意工具/运行身份扩展；旧快速基线与历史证据保留。

按此前方式由当前执行者在本工作区顺序实施，避免跨任务接口分歧，不默认分配多个开发 Agent。用户本轮要求制定计划，本文没有执行结果；后续指示执行时从任务 1 开始，实际外部调用仍需独立授权。
