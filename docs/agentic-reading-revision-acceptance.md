# Agentic RAG 修正验收

更新日期：2026-10-07。依据[设计](superpowers/specs/2026-10-06-agentic-reading-revision-design.md)和[执行计划](superpowers/plans/2026-10-06-agentic-reading-revision.md)。快速是普通 RAG + BM25；深度是 Agentic RAG + BM25。向量继续使用 Milvus，BM25 仍只对当前书当前已读范围的 BookChunk 计算。没有迁移、重建索引、替换供应商或修改 .env。

## 工程证据

2026-10-07 全书问答调查：截图显示空证据 JSON 被当作回答主题。代码确认深度上下文在原始问题后追加了证据容器伪用户消息，且未明确本轮实际章节上限。已调整容器到问题之前、将最终回答指令放回系统策略，并明确服务端批准的上限与内部容器不得展示。模拟回归证明真实问题保持为最后一条用户请求、全书授权可接受后文引用、未授权的后文引用仍被拒绝；不能据此断言真实模型一定调用检索或这本书索引已包含所问片段。

本次相关三套/30 项通过，服务端 `npm run check` 完整通过（112 套/740 项，既有 45 条 lint warning），`git diff --check` 通过。另运行阅读边界、会话与聊天入口三套/20 项通过。未调用真实模型、数据库或向量库，未运行 reader E2E：缺本次隔离目标及费用授权。

2026-10-07 模式保持与 SSE 修复：发送后保留当前会话的深度选择，包括第一条消息自动创建会话的情况；切换既有会话仍恢复快速，联网/全书权限仍为单次授权。按用户确认，工具判断回合保持私有，最终回答独立禁用工具并实时逐段发送，总调用上限仍为四次。以下早期“一次/两次模型完成”记录已被这一流式方案替代，真实延迟与费用需重新评测。

本轮客户端 `npm run check` 通过，60 套/263 项；服务端 `npm run check` 通过，112 套/736 项。服务端随后增加段间阅读范围收紧回归，四套相关测试共 33 项通过，修改范围 lint 通过；`git diff --check` 通过。回归覆盖逐段输出早于下一次 provider 读取、工具文本隐藏、意外工具拒绝、范围收紧和首轮模式保持。未运行真实 provider、数据库、Milvus 或 reader E2E：缺本次隔离目标及真实调用费用授权。

实现位于 [AgenticBookService](../server/src/chat/agentic-book.service.ts)、[受控工具](../server/src/chat/agentic-book-tools.service.ts)及[聊天提交](../server/src/chat/book-chat.service.ts)。原 JSON plan/check 服务已退役，其作用域、进度变化、取消、重叠去重和检索失败回归迁入新测试。2026-10-07 已移除规则强制初始化检索/记忆。深度不调用 Planner 分类：主模型先看本轮请求与有界近期对话，直接回答或用 native tool_calls 请求初次资料；有缺口才继续补检。无需新事实的消息可一个模型回合、零检索结束，单点事实通常一次检索、两个模型回合（工具请求、原文回答）。这增加事实查询一个模型往返，换取统一意图决策，真实延迟仍须测量。主模型同一 provider，maxRetries=0，单次期限 min(现有配置、30 秒、剩余时间)，不自动降级。

四项能力为 book_search、memory_recall、request_external_research、prepare_email。模型不提供身份、书籍、版本或阅读上限。记忆复用现有 MemoryService；当前 MCP 配置通过隔离联网路由使用 Tavily，不是任意工具全量授权。邮件工具只准备草稿。原始用户消息在成功回复后经过一次现有记忆门控；模型输出和工具结果不写为记忆。已落库但派生索引失败只报告未完成，不声称已回滚。

测试使用合成语料、mock 数据服务或 SDK fake fetch，零真实模型/数据库/向量/MCP/SMTP 调用。覆盖一次回答、8 秒响应、按需补检、最多 3 次检索/4 个模型回合、工具多调用修正、错误参数、未知/未授权工具、取消、进度收紧与版本变化、引用范围及 offset 去重、原生分片工具参数合并、零 SDK 重试、记忆传输取消和前端失败显示。工具回合完整缓冲，首字等待时间需在真实测量中单独报告。

| 验收项 | 状态 |
| --- | --- |
| 服务端定向回归 | 已通过 18 套/114 项；随后补充回答时间预留回归 |
| 客户端定向回归 | 已通过 4 文件/17 项 |
| 完整 server/client 质量门 | 通过，server 111 套/725 项；client 60 文件/262 项；两个 check exit 0 |
| 24 题 smoke 的结构/许可/可见证据验证 | 通过；题集仍待人工审定 |
| 空 opt-in 输入拒绝 | 两个入口通过，未启动应用或连接服务 |
| 当前供应商真实工具兼容及 smoke | 未运行 |
| Q/D1 真实准确率、延迟与盲评 | 未运行 |
| D0 旧深度冻结回放 | 未提供真实回放；代码 hash 已冻结，不能代替回答基线 |

## 2026-10-07 根因修复

已复现此前主模型前的强制检索：多种普通确认消息无法先由模型理解；即使已识别为闲聊，规则也会丢弃对话。修正入口执行次序，不扩充确认词表。新回归让未命中词表的消息直接结束，同时验证带后续任务的表达仍可按模型请求检索。模型语义选择使用 fake 回合和真实 SDK fake transport；这些只能证明执行链、不能证明实际供应商能正确判断所有意图。原有作用域、进度、取消、工具权限、去重及预算回归按新的工具起始流程保留。失败日志记录脱敏 runId、实际 stage、模型回合数、已完成工具数与耗时，不记录问题或正文。

记忆重要性评分实际是本地规则，不额外调用模型；仍复用原始用户消息门控，不把模型回答自动保存。服务端与完整检查结果在本轮验证后更新。

## 独立执行真实验收

独立代码审查确认了“帮我准备邮件……”不能启用草稿工具的问题。已先复现三个失败用例，再修复共享意图门控，连同三个拒绝路径，定向 3 套/34 项通过。审查随后因额度限制中断，未形成完整报告，不能记为完整审查通过。

沿用[独立目标门禁](../server/test/deep-reading-target-guard.ts)。需要已核验 `*_test` 数据库与 `test_*` schema、独立书籍和记忆集合、独立上传目录与本地 API、现有 provider 费用授权和测试账号。启动脚本不创建或清空这些目标，不上传私人原文，不运行 ingestion worker。只有上述目标准备完成并获准后执行：

```text
# server/，使用专用进程环境，不能写入 .env
node -r ts-node/register test/start-deep-reading-acceptance.ts
node -r ts-node/register test/run-deep-reading-live.ts --preflight --suite smoke --repeats 1
node -r ts-node/register test/run-deep-reading-live.ts --run --suite smoke --repeats 1
# smoke 审定通过后才运行最终验收
node -r ts-node/register test/run-deep-reading-live.ts --preflight --suite acceptance --repeats 3
node -r ts-node/register test/run-deep-reading-live.ts --run --suite acceptance --repeats 3
```

环境输入沿用旧验收文档的独立目标、指纹、Token、book map 和 `DEEP_READING_ALLOW_LIVE=yes`；对照改为在线 Q（当前 quick）/D1（新深度）。可选 `DEEP_READING_D0_REPLAY_FILE` 必须匹配所选 fixtureHash，每题每次恰有一条旧深度冻结回放；不存在时明确报告未提供，绝不把旧纯向量 B0 改名为 D0。D0 不参与在线延迟统计。

启动测试进程默认且固定使用 fake MCP/SMTP，以防测试真实搜索或发送邮件；真实工具 provider 需另行授权与验证。供应商模型仍为真实调用，必须核验预算。预检按 suite/repeats 计算 HTTP 上限和保守 transport 上限，批准预算不足时任何会话/进度/记忆写入前拒绝；固定“967 请求”不再适用。Q 的 SDK 重试纳入上限，D1 不重试。准备书籍与索引的成本不包含在评测预算。

每轮创建独立测试会话，追问使用同一合成历史，记忆种子有本轮稳定 ID。runner 校验测试书完整正文，保存并恢复测试书进度；会话/记忆按确切 ID 列入报告，不自动删除。报告包括按基线/类别的逐题结果、首个 content 耗时（不算心跳）、总时间、provider 尝试数、embedding 文本数、草稿/记忆事件及固定错误 stage/reason。没有书内检索摘要的纯记忆/工具问题，toolCalls 显示 null，不能伪造为零；真实执行次数仍需结合脱敏 run 日志。联网许可和已确认记忆的语义结果需要人工核验，非空回答、关键词或证据命中不等于正确答案。

真实验收缺隔离目标和本次费用授权，未运行 reader E2E、真实 smoke 或准确率评测。当前只交付工程改动与安全验收入口，不宣称深度已证明更可靠或提高准确率。

完整质量门为两个包的 `npm run check`：lint、生产类型检查、默认测试和构建通过。服务端既有 45 条 lint warning 未放宽规则；本次没有新增 lint error。文档 6 份/36 个本地链接校验通过，`git diff --check` 通过。额外执行全 tsconfig 的 `tsc --noEmit` 曾发现工作区既有 community 测试的两处类型问题（moderation mock 的 tx 类型、message fixture 的 userId），不属于本次修改，未改动；仓库规定的生产 typecheck 与默认 Jest 均通过。
