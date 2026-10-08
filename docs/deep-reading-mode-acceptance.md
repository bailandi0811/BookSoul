# 深度模式实施与验收记录

> 本文保留旧 JSON plan/check 版本的历史证据。2026-10-06 后续已被 [Agentic 修正验收](agentic-reading-revision-acceptance.md)替代；以下旧禁用规则、源码入口、命令和固定预算不代表当前行为。

日期：2026-10-06。依据[设计](superpowers/specs/2026-10-06-deep-reading-mode-design.md)与[执行计划](superpowers/plans/2026-10-06-deep-reading-mode.md)。本记录区分工程验证、真实集成与实际质量。

## 基线与安全预检

B0：开工 HEAD `e6ec3f0b` 的 BookChunkRetrieverService 为旧纯向量实现，可作为代码对照；尚无真实模型评测输出。B1：开工工作区的 Planner 与本书可见 BM25 + 向量融合实现，SHA256 冻结在本计划忽略的工作记录中。既有未提交改动均保留。

默认 Jest 只发现 src 下 .spec.ts，排除 .db.spec.ts 与 prisma.service.spec.ts；认证验收禁用 .env 并替换外部 provider；隔离数据库门禁测试只解析 fixture URL。相关模型、DB、向量服务均通过 mocks 测试。真实 reader E2E 不作为默认执行项。

## 验收状态

| 项目 | 状态 | 证据/限制 |
| --- | --- | --- |
| 快速兼容 | 工程通过 | 旧请求缺省 quick；原有 Planner/聊天/检索回归通过，未用同一份新查询替代 B0 |
| 深度闭环与预算 | 工程通过 | 一/二/三轮、查询去重、无进展停止；真实 SDK + 假 HTTP transport 核验无自动重试与批次计数 |
| 作用域与注入 | 工程通过 | 同一可信边界贯穿检索，生成前复核版本及进度；严格 JSON、引用 ID、低优先级不可信内容，无工具和长期记忆调用 |
| 取消、超时与终态 | 工程通过 | 60 秒编排期限、10 秒心跳、迟到结果和集合初始化取消、生成取消及锁后取消拒绝落库；SSE 断流不能算成功 |
| 前端模式与陈旧事件隔离 | 工程通过 | 共享输入、发送/切书重置、禁用联网、依据有限提示；所有 SSE 事件受 requestId/取消约束 |
| 前后端完整质量门 | 通过 | server/client 的 lint、类型检查、全部默认测试与构建均成功；最终统计见下文 |
| 离线固定题集评分自检 | 通过 | 120 题、开发 40/验收 80；只用标准答案校验评分计算，未执行检索或真实模型 |
| 隔离真实集成 | 未运行 | 缺已核验独立目标与本次外部调用授权 |
| B0/B1/B2 实际质量 | 未运行 | 不宣称深度已证明更优 |

## 实现与检查证据

后端核心为 `DeepBookModelService`（已退役）、`DeepBookContextService`（已退役） 与 [BookChatService](../server/src/chat/book-chat.service.ts)。复用当前书可见正文 BM25 与 Milvus 混合检索，不建立新的词法集合。deep 的完整片段、严格章节限额、跨轮重叠去重仅作用于本次深度请求；quick 和索引 worker 的默认重试契约保留。

前端在共享 [InputArea](../client/src/components/BookChat/components/InputArea.tsx) 选择本次模式，[store](../client/src/store/useChatStore.ts) 解析本次 `runSummary`。摘要不新增历史存储字段。请求示例：`{"sessionId":"当前会话 UUID","message":"请结合原文解释动机","retrievalMode":"deep"}`；不传 owner 或 book scope。

已执行命令（各自包目录）：

```text
server: npm run check
client: npm run check
server: npm test -- --runInBand deep-book-context.service.spec.ts
server: node -r ts-node/register test/run-deep-reading-offline.ts --fixtures test/fixtures/deep-reading-mode.json
```

客户端完整检查：60 个测试文件、261 项测试全部通过，类型检查与构建通过。服务端最终完整检查：105 个测试套件、702 项测试全部通过，类型检查与构建通过；新增“检索时书籍失效映射 BOOK_CONTEXT_CHANGED”回归也已包含其中。两个 check 均成功退出（exit 0）。既有 server lint 有 45 条 warning、无 error；没有降低质量门。客户端既有 Browserslist 数据陈旧和构建耗时提示未修改。

离线 fixture SHA256：`54d975f7705455f390be48aed552ac19a0e930373aa6e98d1a5e690b4ea077e0`。题集为原创合成语料的固定变体，标记 `human-review-pending`，需要人工审题。自检输出 `liveQualityVerified=false`、`semanticAccuracy=null`；标准证据评分得到 1 仅证明评分器自洽，不能证明混合召回或 Agent 效果。尚未执行 dense/BM25/hybrid 同查询消融、真实 B0/B1/B2 回放或盲评。

一次独立代码审查发现并修复：测试进程的默认记忆集合未隔离、取消期间可能继续初始化后搜索、生成迭代器清理可能等待不返回、无 DONE 的 SSE 被误计成功。对应拒绝/回归测试已纳入默认质量门。两个真实验收入口使用空输入进行安全导入与类型检查，均在目标初始化前拒绝；未连接外部服务。

## 输出校验故障修复（2026-10-06）

用户提供的单行 `DEEP_MODE_OUTPUT_INVALID` 日志不能确定原请求的失败分支。通过回归复现确认：完整 JSON 包在代码框中会被原来的直接 JSON.parse 拒绝；该格式兼容已修复，仍拒绝额外权限字段、非法引用和 JSON 前后的解释文字。证据检查提示词原示例将枚举写成竖线字符串且 supported 配空引用，已换成合法 missing 示例并明确枚举、字段及 ID 规则；没有改变预算、供应商或增加重试。

输出错误现在附带内部固定 `stage/reason`，涵盖 plan/check 的解析、schema、引用、截断、内容类型和输入大小，以及 generate 的输入大小/空回答和编排结果缺失。控制器错误日志可显示 `stage=check, reason=coverage_invalid` 等信息；公开 SSE code 不变，不记录私人问题、模型输出或账号。新增回归先失败再通过，定向四个套件共 25 项通过；服务端 `npm run check` 完整复验 exit 0，105 个套件、706 项测试通过，lint/类型检查/构建通过（仍为既有 45 条 lint warning）。本次未通过真实模型重放原问题，因此不宣称已确认原请求根因。

## 独立真实评测操作说明

以下操作会启动真实连接、写入独立测试会话并产生模型费用，本次没有执行。调用者需先获得本次授权并准备隔离环境；不得复制本机应用库、修改 `.env` 或清空任何已有目标。新建测试数据库/schema、迁移、测试账号、合成书上传和索引准备也需独立核对和授权，脚本不自动完成这些动作。

1. 准备与应用库完整指纹不同的 `*_test` 数据库及 `test_*` schema，schema 与当前 Prisma 模型一致。准备两个独立 `test_*` 向量集合（书籍与记忆）、独立且目录名为 `test_*` 的绝对上传目录、本地专用 API 端口，以及现有供应商的可用测试额度。
2. 在隔离目标中准备 fixture 三本合成小说，保持原题集分章与正文、索引版本有效并为 READY，归属于专用测试账号。runner 会比较当前版本块拼接后的完整正文，内容不同则拒绝调用模型。目录/切块若改变引用映射，也必须先验证；此入口不能代替上传/索引闭环 E2E。
3. 准备 book map JSON：键为 fixture 的 `books[].id`，值为相应实际书籍 UUID。准备专用账号 Access Token，足够覆盖整次评测的有效期及现有 API 速率限制。
4. 在受控旧纯向量实现上取得冻结 B0，人工核对源码与模型配置；文件结构为 `{"fixtureHash":"上述 SHA256","sourceHash":"B0 源码 hash","rows":[{"id":"题目 ID","run":1,"chunkIds":["fixture 证据 ID"],"answer":"合成回答"}]}`。选定 split 的每题须恰好有 run 1、2、3。脚本检查 fixture hash 与覆盖，`sourceHash` 为审计元数据，其真实性仍需人工核验。
5. 用专用进程环境提供下表变量；只在内存中设置，不写配置文件。指纹与 usage 输出路径必须是本轮尚不存在的文件，不覆盖旧报告。

| 变量 | 要求 |
| --- | --- |
| `DATABASE_URL`, `TEST_DATABASE_URL` | 前者仅用于应用/测试目标比对；后者为已核验独立数据库与 schema |
| `MILVUS_ADDRESS`, `MILVUS_BOOK_COLLECTION_NAME` | 已核验向量目标地址与应用书籍集合，用于比对；凭据沿用受控进程配置 |
| `TEST_MILVUS_COLLECTION`, `TEST_MILVUS_MEMORY_COLLECTION` | 不同的 `test_*` 集合；不能为应用书籍集合或默认 `memory_embeddings` |
| `BOOK_UPLOAD_DIR`, `TEST_UPLOAD_DIR` | 应用目录与独立绝对测试目录；测试目录不能位于应用目录内 |
| `TEST_API_BASE_URL` | 专用本地 HTTP origin，如 `http://127.0.0.1:3901` |
| `OPENAI_BASE_URL`, `OPENAI_API_KEY` | 明确使用现有 provider；其余模型/鉴权配置满足当前启动校验，不引入新供应商 |
| `DEEP_READING_MAX_REQUESTS` | 正整数 API 预算；验收集正常完整回放需 967 次（480 聊天 + 480 建会话 + 7 预检/进度） |
| `DEEP_READING_MAX_CHAT_CALLS`, `DEEP_READING_MAX_EMBEDDING_TEXTS` | 调用者批准的 provider 预算；涵盖 B1 Planner/记忆与实际 Embedding 分批，不自动估算费用 |
| `DEEP_READING_SERVER_FINGERPRINT_FILE` | 本轮指纹输出路径；旁边生成 `.usage.json` 数字计数文件 |
| `DEEP_READING_ALLOW_LIVE` | 本次获准后显式设为 `yes` |
| `DEEP_READING_ACCESS_TOKEN` | 仅 runner 使用的专用测试账号 Token，不进入输出 |
| `DEEP_READING_BOOK_MAP_FILE`, `DEEP_READING_B0_REPLAY_FILE` | 仅 runner 使用的上述 book map 与冻结 B0 文件路径 |

在 `server/` 使用两个受控终端、相同测试配置，依次执行：

```text
# 终端 1：获准后启动专用 API，生成真实启动指纹与 transport 计数
node -r ts-node/register test/start-deep-reading-acceptance.ts
# 终端 2：先只读核对指纹、PID 存活与剩余预算
node -r ts-node/register test/run-deep-reading-live.ts --preflight
# 仅在上述检查通过且本次费用获准后执行
node -r ts-node/register test/run-deep-reading-live.ts --run --split acceptance
```

开发集改为 `--run --split development`，报告不能混入最终验收。验收集为 B0 冻结 240 行，B1/B2 在线共 480 次聊天；每轮新建会话并对追问写入同一合成历史。模型预算由专用服务的 fetch transport 扣减，计实际请求/Embedding 文本，不记录正文。专用 API 关闭 ingestion worker，指纹里的 worker PID 表示同进程受控模块配置，不表示实际执行了索引 worker。

报告含逐题证据评分、回答待审清单、成功/错误、耗时及前后 transport 计数；人工计算分位耗时、核验 token 日志并按设计开展盲评。关键词命中不替代语义正确性，报告始终要求人工审阅。失败保留已写的测试会话和计数，不自动删除、不覆盖报告、不宣称通过；清理需按确切 ID 另行授权。B0 的生成工具、题集人工审定、上传/索引集成、真实取消/故障轨迹与最终质量阶段门仍是待验收事项。
