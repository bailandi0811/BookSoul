# Agent 与 Skill 显式绑定实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [x]`) syntax for tracking. 依项目约定在当前工作区实施，不创建分支、不提交、不覆盖用户改动；本计划不要求多 Agent 并行。

**Goal:** 通过受控入口让塔罗选阵与解读只能使用对应 skill，其他运行职责不能自动或越权取得这些规则，新增 skill 默认不授权。

**Architecture:** 纯 TypeScript 访问层先验证目录与绑定，再允许加载；内部目录引用业务拥有的原规则文件。两个固定角色端口供现有入口消费，源码边界测试阻止业务代码直接导入绕过。不新增 Nest 模块、工具或自动扫描。

**Tech Stack:** 当前 TypeScript、NestJS、Jest；使用已有 TypeScript AST 能力做只读源码检查，不新增依赖。

**Spec:** [已批准设计](../specs/2026-10-06-agent-skill-binding-design.md)。

**状态：** 用户已批准并在原工作区顺序执行完成。服务端98个测试文件／651例、lint/typecheck/build通过；一次独立审查的两处边界问题已修复，未调用真实模型。

## Global Constraints

- Agent 固定为 tarot-selector、tarot-interpreter；Skill 固定为 tarot-spread-selection、tarot-reading，一对一绑定。
- 未知 Agent 无权限，未知 Skill 与未授权访问拒绝；新注册 skill 不自动绑定，不自动依赖加载。
- 角色由服务端固定入口决定，不接受用户或模型传入的 Agent ID；不暴露全局目录、任意身份工厂或 skill 工具。
- 选阵内容仍为 spread-selection-v2；解读内容仍为 spread-routing-v2，规则文本与模型请求结构保持等价。
- 保留四选项、confidence>=0.8、权威牌局、HTTP/SSE、当前局两条消息、取消/超时/maxRetries=0/800 输出 token 上限。
- 同进程应用隔离不等同于系统沙箱；不为模型新增文件、代码执行或工具能力。
- 不改客户端、单书业务、.env、供应商配置、依赖、CI、数据库、向量库或部署；不运行真实模型调用。
- 无新缓存、历史、热更新或持久存储。所有生成/格式修改限于本轮目标文件。

## Review Focus

1. 伪造 Agent/Skill ID 或注册未绑定内容：授权必须先于加载和模型调用，Task 1/2 覆盖。
2. 固定端口被其他角色导入、转导出或 require 绕过：Task 3 检查生产源码及违规负例。
3. 返回对象修改污染下一次运行：Task 1 覆盖递归对象和数组，不以顶层 freeze 代替完整隔离。
4. Skill 管理错误被供应商 catch 当作 unavailable：Task 2 证明内部拒绝显式失败且无网络调用。
5. 新注册目录把旧测试/CLI 变成绕过入口，或 prompt/版本发生变化：Task 2/3 覆盖元数据通道、请求等价及角色混合调用。

## Task 1：纯授权访问层

**Create:** `server/src/agent-skills/agent-skill.types.ts`、`agent-skill.access.ts`、`agent-skill.access.spec.ts`。

**Interfaces:**

- `SkillMetadata`: readonly id/version/description/kind；kind 为 choice-policy 或 prompt-rules。
- `SkillDefinition<T>`: SkillMetadata 加 `load: () => T`。
- `AgentSkillAccessError`: 包含稳定 code：AGENT_SKILL_AGENT_UNKNOWN、AGENT_SKILL_UNKNOWN、AGENT_SKILL_FORBIDDEN、AGENT_SKILL_CATALOG_INVALID；不附内容或私有输入。
- `createSkillAccess<S extends Record<string, unknown>>(definitions: {[K in keyof S]: SkillDefinition<S[K]>}, bindings: Readonly<Record<string, readonly (keyof S & string)[]>>)` 创建内部访问对象。
- `list(agentId: string): readonly SkillMetadata[]` 仅返回已绑定元数据，未知 Agent 返回空列表；`load<K extends keyof S & string>(agentId: string, skillId: K): Readonly<S[K]>` 运行时验证 Agent/Skill/绑定后加载，非法运行时值仍拒绝。内部目录及访问对象不向业务调用方导出。
- 每次返回独立、递归不可变的 JSON 策略数据；本轮 payload 仅对象/数组/string/number/boolean，不允许加载结果包含函数或任意类实例。加载器本身只在授权之后执行。

- [x] 写失败测试：允许的角色可列举并加载；另一角色看不到内容/元数据；交叉加载、未知角色/Skill、注册未绑定 skill 拒绝且 loader spy 为 0。检查重复元数据 ID、ID 与键不一致、空版本、非法 kind、绑定不存在的 skill，均构造失败。
- [x] Run（server）：`node node_modules/jest/bin/jest.js --runInBand agent-skill.access.spec.ts`，确认因缺失目标模块 RED。
- [x] 实现纯访问层，先校验目录/绑定再创建访问对象；授权判定置于加载前，无网络/环境/数据库读取。复制并递归冻结受支持的返回数据，拒绝不支持的数据形态。
- [x] 增加对象、嵌套数组修改的隔离测试，使用 Reflect.set 或捕获 TypeError，确认下一次访问未污染；目录与绑定输入的外部修改不能改变已创建访问对象。
- [x] Run 同文件，确认全部 GREEN。此任务的访问层仅供后续内部目录使用，不添加 HTTP 或模型工具接口。

## Task 2：固定角色端口与塔罗接入

**Create:** `server/src/agent-skills/agent-skill.catalog.ts`、`tarot-agent-skills.ts`、`tarot-agent-skills.spec.ts`。  
**Modify:** `server/src/tarot/tarot-reading.rules.ts`、`tarot-reading.prompt.ts`、`tarot-provider.service.ts`、相邻 provider/prompt/spreads/evaluation 测试、`server/test/run-tarot-reading-quality.ts`。

**Consumes:** Task 1 访问层；现有 selection.rules 的 Choice 构造器与版本，reading.rules 的公共/专用文本，生成的 TarotSpread 类型。

**Produces:**

- 内部 catalog 固定绑定表，不导出原始定义或访问对象。选择载荷为 `ReturnType<typeof buildTarotSelectionQuestion>`；解读载荷为公共字符串与按 TarotSpread 索引的专用字符串。
- 在 reading.rules 定义 `TAROT_READING_RULE_VERSION='spread-routing-v2'`，避免 catalog 导入 prompt 后产生循环依赖；原 `TAROT_READING_PROMPT_VERSION` 继续以相同值对外提供。
- 固定端口 `loadTarotSelectionSkill()` 返回 `{agentId:'tarot-selector',skillId:'tarot-spread-selection',skillVersion,content:SelectionPolicy}`。
- 固定端口 `loadTarotReadingSkill(spread: TarotSpread)` 返回 `{agentId:'tarot-interpreter',skillId:'tarot-reading',skillVersion,content:string}`，content 仅公共规则＋当前牌阵专用规则，未知 spread 拒绝。没有可自由传入 Agent ID 的重载。
- 仅供受信任调用方/CLI 的 `TAROT_SELECTION_SKILL_METADATA`、`TAROT_READING_SKILL_METADATA` 为只读元数据，不触发内容加载，不改变授权。

- [x] 写失败测试：两个固定端口的 ID/版本/内容类型准确；单张/时间流/圣三角只含当前专用规则；选阵内容不含解读策略，解读不含选阵 Choice。用现有原始构造结果做深等价比较，不只匹配某个短词。
- [x] 增加 provider 入口测试：使用固定 selector 端口，伪造问题中的 agentId/skillId 不改变绑定；端口抛 AgentSkillAccessError 时不调用 fetch，错误不被转换为 unavailable。测试顺序要保证声明的错误路径实际执行。
- [x] Run（server）：`node node_modules/jest/bin/jest.js --runInBand tarot-agent-skills.spec.ts tarot-provider.service.spec.ts tarot-reading.prompt.spec.ts`，确认新模块/接入断言 RED。
- [x] 编写内部 catalog 与固定端口；目录只加载业务规则，不导入 AppModule/AgentModule/RAG/Memory。原公共/专用规则文本不改，读取前授权；端口只能由对应业务入口使用。
- [x] Provider.classify 在外部调用 try/catch 之前取得授权策略，HTTP body 使用 content；已有阶段日志补固定 agentId/skillId/skillVersion。内部配置错误不能吞掉，网络错误的既有 unavailable 行为保持。
- [x] Prompt 在原输入/牌单校验之后通过 interpreter 端口取当前规则；继续生成完全等价的 system/user 两条消息。Provider.read 的日志补固定解读身份与元数据，不调用两次加载器或增加模型请求。
- [x] CLI 及仅消费版本的测试改为从允许的元数据端口取得 selection version，不为读版本加载规则；保留默认零外部调用。需要测试原内容等价的离线规则测试仍在白名单内，不能成为生产 API。
- [x] Run 同组，再 `node node_modules/jest/bin/jest.js --runInBand tarot`；覆盖连续角色混合请求、原局重试、取消和非法输入。运行 CLI 默认预检 `node -r ts-node/register test/run-tarot-reading-quality.ts`，确认24/18计划与externalCalls=0，不加execute。

## Task 3：源码边界、接入规范与最终验证

**Create:** `server/src/agent-skills/agent-skill.boundaries.spec.ts`、`docs/agent-skills.md`。  
**Modify:** `AGENTS.md`（增加短规则及文档入口）、`docs/tarot-acceptance.md`，本计划状态。

**Consumes:** Task 2 的具体模块、固定端口与生产使用路径。

**Produces:** 默认 Jest 下的只读源码约束与新 skill 接入规范。

- [x] 在 boundaries.spec.ts 内实现只用于测试的检查器 `checkSkillImports(filePath: string, source: string): BoundaryViolation[]`，violation 为相对源码路径和稳定规则原因。使用现有 TypeScript AST 与 tsconfig 模块解析，检查 import、export-from、import-equals、字面量 require/import()，不能仅用单一正则检查 import。不向业务运行模块添加扫描逻辑。
- [x] 写失败负例：生产模块直接导入原规则、catalog/access 内部模块、其他角色端口或转导出均命中；../ 路径、.js/.ts 扩展、index 与配置别名解析一致。管理模块/固定端口中非字面量模块加载也拒绝，不能用动态表达式隐藏绕过。只保护本轮目录和加载端口，不顺手改其他业务代码。
- [x] Run（server）：`node node_modules/jest/bin/jest.js --runInBand agent-skill.boundaries.spec.ts`，确认违规测试与当前未限定导入失败，再完善显式白名单。
- [x] 保护原 rule 文件：生产直接导入仅允许 catalog；core/types/catalog 内部接口仅允许管理目录的规定依赖边；selection 固定加载函数仅允许 provider，reading 固定加载函数仅允许 prompt。Provider.read 可读取解读元数据，CLI 只允许读取元数据；按导入符号区分端口能力，不能把整个 module 放行给所有消费者。
- [x] 扫描 `server/src` 的生产 .ts，排除 .spec.ts（独立负例验证检查器）；同时显式扫描 `server/test/run-tarot-reading-quality.ts` 与 `tarot-evaluation.ts` 的接入路径。确保现有单书 Agent 未取得新 skill，违规信息不打印源码内容或私人数据。受保护内部目录不得增加跨目录 re-export 桶文件绕过检查。
- [x] Run 同文件与 Task 1/2 相关 tests，确保真实生产扫描通过、人工构造的越权负例被拒绝。
- [x] 写 docs/agent-skills.md：唯一绑定表位置、两种职责和调用顺序、skill≠tool、关闭自动触发≠授权隔离、同进程限制、新增/解绑步骤与版本规范；AGENTS.md 只链接该文档并规定默认拒绝和回归要求。同步验收记录实际测试、拒绝路径与未测系统边界，不重复复制清单。
- [x] 复核两个 package.json/Jest 配置与环境加载路径，Run（server）：`node node_modules/jest/bin/jest.js --listTests --runInBand --json`；确认真实 Prisma/.db.spec.ts 排除、Prisma 错误测试仍 mock。无法证明安全则不跑全量质量门，不修改 .env。
- [x] Run（server）：`npm run check`；相关新文件 Prettier check；`git diff --check`、`git status --short` 并审阅新文件。保留原工作区改动，不添加凭据、运行数据或生成物。本轮没有客户端修改，不重复客户端或真实 reader E2E。
- [x] 更新设计/计划/验收状态，最终说明绑定结果、改动文件、实际测试证据及同进程限制；不把离线授权测试称为真实模型质量评测。

## 自查与执行交接

已逐项核对设计第1–9节：Task 1 授权与不可变返回，Task 2 固定身份/当前策略/元数据与日志，Task 3 直接导入绕过/CLI/未来规范与质量门。未授权调用在 loader 前拒绝，不能只测试“正常绑定能加载”。类型及两个规则版本一致，catalog 不依赖 prompt，避免循环。

实施不要求用户批准每个局部修复，也不要求新一轮付费测试。建议在现有工作区顺序执行；用户批准本计划并选择该方式后开始，不自动创建 worktree/分支/提交或启动外部服务。
