# 塔罗选阵与解读规则实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [x]`) syntax for tracking. 遵守 AGENTS.md，不创建分支、不提交、不覆盖用户工作；完成后只做一次独立只读审查。

**Goal:** Jev 抽牌前选定单张是非、时间之流或圣三角；服务端锁定牌阵，前端与解读模型使用同一份牌位定义，解读加载对应规则。

**Architecture:** 共同 JSON 经同步脚本生成前后端静态定义。现有分类使用四选一 Choice，局状态继续只保存权威 spread，解读纯函数补齐本地牌阵和牌义。保持原有 HTTP 字段与 SSE、认证／取消／重试边界。

**Tech Stack:** 当前 Node 22、npm、React、TypeScript、NestJS、Zod、Jest、Vitest、ChatOpenAI；同步脚本使用 Node 内置测试，不新增依赖。

**Spec:** [已批准设计](../specs/2026-10-06-tarot-spread-routing-design.md)。

**状态：** 用户已批准并执行 Task 1–4；最终质量门通过：客户端 256 例、服务端 616 例，两个包 lint/typecheck/build 均通过；一次独立只读审查无阻断性缺陷。用户已单独授权真实验收；首个 Jev 请求返回 unavailable，按约定停止：1 次选阵尝试、0 次解读，41 项未执行。真实效果未验收通过，具体失败原因待诊断。补充概率边界与重试测试属于已有行为的覆盖扩展，未声称这些追加测试曾失败。

## Global Constraints

- 标识固定：`yes_no` 保留 1 张 answer；`three_card` 保留 3 张 past/present/future；新增 `triangle` 为 3 张 situation/obstacle/outlook，不允许动态牌位。
- 牌组保持 78 张，draw.cardCount 仍是 78；所需揭晓张数由定义的 cardCountRequired 决定，不能混为一谈。
- Jev 不确定、低于 0.8、失败或非法响应仍进入 choose；高置信度锁定牌阵，原局重试不重新分类／抽牌。
- maxRetries=0、maxTokens=800、现有截止时间／取消、两条当前局消息、SSE 终止语义不变；不加审核模型，不走单书 Agent/RAG/Memory。
- 规则显式随服务端加载，用户问题是不可信数据；本地 deck 为牌义事实源，不声称读到了未提供的图像。
- 不改 .env、既有供应商适配／配置、依赖、部署、数据库、向量库、上传目录或其他用户改动。默认测试只用替身。
- 真实验收单独授权：最多 24 次 Jev + 18 次聊天、聊天输出上限 14,400 token，另计输入和 Jev 用量；本轮工程执行不自动授权这些调用。
- 前后端配套发布；旧客户端不能识别 triangle，保留旧枚举语义不等于旧客户端能接受新增枚举。

## Review Focus

1. 非法牌阵定义导致生成两端不一致：生成前拒绝重复标识／牌位、张数不符；--check 不写文件，测试归 Task 1。
2. 分类字面关键词覆盖问题目的：规则必须包含混合问题对照例；置信度和正确率分开，测试归 Task 2／4。
3. 时间线牌位混入圣三角：服务端模型前拒绝，前端发现与当前局不匹配则显示错误，测试归 Task 2／3。
4. 旧请求晚到或原局重试改牌位：原有隔离保留，triangle 纳入切换／取消／锁定测试，归 Task 2／3。
5. 验收脚本默认加载环境、收费或吞掉失败：默认零调用、输出路径受控、失败停止、总数上限和取消可测，归 Task 4。

## Task 1：共同牌阵定义与生成

**Create:** `shared/tarot/spreads.json`、`scripts/sync-tarot-spreads.mjs`、`scripts/sync-tarot-spreads.test.mjs`。脚本负责生成 `server/src/tarot/tarot-spreads.generated.ts`、`client/src/lib/tarot-spreads.generated.ts`。

**Interfaces:** JSON 为数组，各项 `{id,name,description,cardCountRequired,positions:[{id,label,meaning}]}`。生成模块导出只读 `TAROT_SPREADS`，及从该常量推导的 `TarotSpread`、`TarotPosition` 类型。脚本导出 `validateSpreads(input)`、异步 `renderSpreadSource(input)` 及 `syncSpreadModules({inputPath,outputPaths,checkOnly}): Promise<boolean>`，false 表示 check 发现陈旧文件。函数允许测试传入临时路径，CLI 路径固定；默认同步两端，`--check` 只比较内容、不写文件，陈旧时退出码 1。不改现有牌组同步脚本。

- [x] 写 Node 测试：三个定义准确；重复 spread、重复 position、未知 id、空 label/meaning、错误顺序、牌数不符抛错；生成源包含三个标识及七种牌位，两端内容一致；--check 对临时陈旧目标返回非零且文件字节不变。测试 fixture 只写独立临时目录。

```js
assert.deepEqual(definitions.map(d => [d.id, d.cardCountRequired]),
  [['yes_no', 1], ['three_card', 3], ['triangle', 3]]);
assert.deepEqual(definitions[2].positions.map(p => [p.id, p.label]),
  [['situation', '现状'], ['obstacle', '阻碍'], ['outlook', '发展趋势']]);
```

- [x] Run：`node --test scripts/sync-tarot-spreads.test.mjs`。Expected：因模块缺失／目标断言失败而 RED，不是访问数据库或权限造成的失败。
- [x] 按已批准设计第 2 节编写 JSON、纯校验与生成逻辑；使用现有 server Prettier，输出带来源注释。临时路径可由内部函数参数用于测试，CLI 不开放任意写路径。
- [x] Run：`node --test scripts/sync-tarot-spreads.test.mjs`，再 `node scripts/sync-tarot-spreads.mjs`、`node scripts/sync-tarot-spreads.mjs --check`。Expected：测试通过，生成输出一致，check 退出码 0。

## Task 2：权威牌阵、Jev 选阵规则与解读规则

**Modify:** `server/src/tarot/tarot.types.ts`、`tarot.policy.ts`、`tarot-state.service.ts`、`tarot-provider.service.ts`、`tarot-reading.prompt.ts`，相邻 state/provider/prompt/controller 测试。**Create:** `server/src/tarot/tarot-selection.rules.ts`、`tarot-reading.rules.ts`、`tarot-spreads.spec.ts`。

**Consumes:** Task 1 的 TAROT_SPREADS 与类型。**Produces:** policy 保留 `positions(spread: TarotSpread): TarotPosition[]`，新增 `getTarotSpread(spread: TarotSpread)` 返回该标识的本地定义，未知运行时值抛 TAROT_DECK_INVALID。`TarotReadingInput`、`getReading(owner,readingId)`、provider.read(input,signal) 参数结构不变。selection.rules 的 `buildTarotSelectionQuestion()` 返回 `{type:'choice',instructions,criteria}`，criteria 固定四个标识；解读规则导出 `TAROT_READING_COMMON_RULES` 与 `TAROT_READING_RULES`（按三个 TarotSpread 键索引），纯函数仍返回 `[system,user]`。

- [x] 写失败测试：triangle classification confidence=0.8 自动 fixed，0.79 choose；未知 choice、缺 triangle 概率、NaN／越界／概率和错误进入 unavailable。请求策略包含问题目的及边界对照例，恶意问题仅进入 state，四项 criteria 不受其影响。
- [x] 扩展 state/controller 测试：triangle 依次揭晓 situation/obstacle/outlook；第四次新牌拒绝，重复揭晓幂等；fixed 或已洗牌后替换 spread 得 TAROT_SPREAD_LOCKED；越 owner 拒绝；HTTP readings 仍拒绝外传 question/cards/spread。
- [x] 扩展 prompt/provider 测试：triangle 传递中文名称、牌位解释、正确牌义；混入 past/present/future 在模型构造前拒绝；sparse／重复／未知牌和方向错误仍拒绝；连续 yes_no → three_card → triangle → yes_no 均只有当前局两条消息。

```ts
expect(positions('triangle')).toEqual(['situation', 'obstacle', 'outlook']);
expect(selection.criteria).toHaveProperty('triangle');
expect(Object.keys(selection.criteria).sort()).toEqual(
  ['three_card', 'triangle', 'unclear', 'yes_no']);
expect(triangleUser.spreadDefinition.positions.map(p => p.label))
  .toEqual(['现状', '阻碍', '发展趋势']);
```

- [x] Run（server）：`npm test -- --runInBand tarot-spreads.spec.ts tarot-state.service.spec.ts tarot-provider.service.spec.ts tarot-reading.prompt.spec.ts tarot.controller.spec.ts`。Expected：新增标识／字段不支持等目标断言 RED。
- [x] 引用生成类型并扩充严格 schema。局状态仅保存选定 spread，用 getTarotSpread 确定张数／顺序；牌组 cardCount 78 不变。Provider.classify 使用 buildTarotSelectionQuestion，不改当前 base/path/model、response model 日志或 deadline。
- [x] 将原共同／专用文本移入 reading.rules，按设计第 5 节改写：先回应问题、结合固定牌位与实际牌义、多牌间至少一处联系、具体建议；三种专用段落互斥。user JSON 增加可信本地 `spreadDefinition`，保留 spread/cardCount/untrustedQuestion/cards；不把问题或牌义拼到系统规则。不复制外部整套 skill 或牌义。
- [x] 更新 prompt 版本为 `spread-routing-v2`，选阵规则版本 `spread-selection-v1`；原有 runId/耗时/模型/数字用量日志可增加规则版本，但不记录问题／牌面。若摘录外部实质内容，随代码附 MIT 来源与许可；自行编写的方法说明保留设计中的参考链接。
- [x] Run 同组 Jest，再 `npm test -- --runInBand tarot`。Expected：新增测试及所有原有塔罗测试通过，取消／超时、原局重试、终止事件各至多一次不回归。

## Task 3：客户端三种牌阵与动态牌位

**Modify:** `client/src/lib/tarot-types.ts`、`tarot-api.ts`／测试，`client/src/components/Tarot/useTarotRound.ts`／测试、`TarotPage.tsx`／测试；必要时仅在 `tarot.css` 调整三种自选布局。**Create:** `client/src/lib/tarot-spreads.ts`。

**Consumes:** Task 1 的共同定义、Task 2 新增枚举响应。**Produces:** 客户端 `getTarotSpread(spread: TarotSpread)` 返回同一静态定义；类型引用生成模块，API/hook/Page 不另写牌位数组。HTTP 字段／stream 方法签名不变。

- [x] 写失败测试：triangle 分类／洗牌／揭晓响应合法；未知 position 和 spread 拒绝；hook 对当前 triangle 收到 past 位或错误顺序时拒绝，不触发解读；旧异步结果不能覆盖新局。
- [x] Page 测试：choose 显示三种选项，triangle 待抽显示现状／阻碍／发展趋势与点击顺序，已抽和重试仍使用同样牌位；时间之流继续显示过去／现在／未来；单张仍为是非；重新占卜清除旧牌和答案。

```tsx
expect(screen.getByRole('button', { name: /圣三角/ })).toBeInTheDocument();
expect(screen.getByText('现状')).toBeInTheDocument();
expect(screen.getByText('阻碍')).toBeInTheDocument();
expect(screen.getByText('发展趋势')).toBeInTheDocument();
expect(screen.queryByText('过去')).not.toBeInTheDocument();
```

相邻测试使用哪个渲染库就沿用哪个；若未配置 jest-dom，使用相邻原生 DOM 断言表达相同结果，不新增依赖。

- [x] Run（client）：`npm test -- src/lib/tarot-api.test.ts src/components/Tarot/useTarotRound.test.tsx src/components/Tarot/TarotPage.test.tsx`。Expected：新枚举／三种选择／动态牌位断言 RED。
- [x] 从共同定义取名字、用途、所需张数与牌位标签。API 校验新增枚举；hook 揭晓时比对当前局定义、预期序号与 cardCountRequired，再接受响应。保留 authGeneration、operation、abort 的旧响应隔离。
- [x] 固定提示更新为「问题会发送给 TypeSafe 用于选择牌阵，并发送给当前聊天模型用于解读。请勿输入敏感信息。」；前端不出现新增技术字段。保留现有纸笺、牌面、动效和响应式风格。
- [x] Run 同组三个 Vitest，Expected：全部通过；用局部模拟响应查看三选项在桌面／窄屏不溢出，必要的 CSS 修改仅作用本页。模拟不连接真实登录／数据库或供应商，不把模拟页面加入提交内容。

## Task 4：验收入口、文档同步与最终检查

**Modify:** `server/test/fixtures/tarot-reading-quality.json`、`server/test/run-tarot-reading-quality.ts`、`server/src/tarot/tarot-reading.fixtures.spec.ts`、原设计、上一轮质量计划的状态说明、`docs/tarot-acceptance.md`。**Create:** `server/test/fixtures/tarot-selection-quality.json`、`server/test/tarot-evaluation.ts`、`server/src/tarot/tarot-evaluation.spec.ts`。

**Consumes:** 三种定义与两套规则版本，现有 provider.classify/read。**Produces:** 原独立脚本默认 dry-run，显式 `--execute --output <仓库外新报告>` 才可调用；24 选阵 +18 解读，分类与解读预期／完成／失败／未运行均分别记录，始终待人工解读评审。

编排模块导出 `parseEvaluationFixtures(selection: unknown, readings: unknown): EvaluationFixtures`、`openEvaluationReport(target: string): Promise<FileHandle>`、`runTarotEvaluation(fixtures: EvaluationFixtures, provider: Pick<TarotProviderService,'classify'|'read'>, signal: AbortSignal, onResult: (result: EvaluationResult) => Promise<void>): Promise<EvaluationSummary>`。Fixture 类型由 Zod 推导；结果包含 phase、caseId、status、durationMs 及分类选择／合成解读或稳定错误码，summary 分阶段 planned/attempted/completed/unattempted 与 cancelled。编排模块不读环境、不创建真实 provider、不安装进程信号监听；这些只由显式 execute 的 CLI 分支负责。报告处理复用现有 realpath、仓库外路径校验和 wx 创建，重构时保持错误脱敏。

- [x] 扩展 fixture 测试：保留原 12 个代表性牌单，加 6 个 triangle（含截图固定牌单按圣三角解释）；三种各 6，顺序符合共同定义。选阵 fixture 24 项，结构 `{id,question,expectedSpread,review}`，expectedSpread 允许 unclear，三种各 6、模糊／注入 6；id 唯一、问题 <=300 codepoint。
- [x] 写验收失败路径测试：默认预检不加载环境、不创建 provider、不调用网络／数据库；--execute 下 24 次 classify +18 次 read 上限；第一个故障即停止，SIGINT/SIGTERM 取消余下；仓库内／符号链接回仓库／已有报告拒绝且零调用；未知配置与真实错误不打印原文。脚本测试使用子进程或可注入的 provider／report 写入替身，隔离当前真实环境，不能运行带真实密钥的 execute 分支来测拒绝。
- [x] Run（server）：`npm test -- --runInBand tarot-reading.fixtures.spec.ts tarot-evaluation.spec.ts`。Expected：旧 12 用例／24 聊天调用约定与新增契约不符而 RED。
- [x] 更新脚本：默认只检查两个 fixture 的结构及共同牌阵不变量，输出规则版本、24/18 计划次数、14,400 聊天输出上限、externalCalls=0。execute 仍只读取当前配置，直接 provider，先完成全量预检与路径验证；串行先分类后解读，分类返回 unavailable 算失败并停止，不伪装成功；unclear/低置信度为有效业务结果，按 fixture 评审。错误／取消和未尝试计入报告，不自动重试。
- [x] 将副作用编排提取为 `server/test/tarot-evaluation.ts`（输入解析、执行循环与受控报告），原脚本只做 CLI；上一步 Jest 通过 import 纯编排并注入替身验证，避免运行 CLI main 或加载 .env。不复用业务服务器启动，不增加通用执行框架。
- [x] Run 同组 Jest 和 `node -r ts-node/register test/run-tarot-reading-quality.ts`。Expected：通过，externalCalls=0，validSelectionCases=24、validReadingCases=18、plannedCalls=42、maxChatOutputTokens=14400。
- [x] 同步原设计的范围／牌阵表／Jev criteria／请求示例／概率说明／页面外发说明／单张倾向，明确三选项旧概率说明不再适用；验收文档分开记录工程验证与真实效果未验收，旧质量计划指向本轮扩展，不改历史实测数字。
- [x] 复核 package.json、测试环境加载及最终发现范围。Run（server）：`node node_modules/jest/bin/jest.js --listTests --runInBand`。Expected：默认不含 `.db.spec.ts` 和真实 `prisma.service.spec.ts`；Prisma 错误测试为替身。若不能证明安全，不跑质量门、不改 .env。
- [x] Run：`node --test scripts/sync-tarot-spreads.test.mjs`、`node scripts/sync-tarot-spreads.mjs --check`、两个包 `npm run check`。Expected：相关测试、lint、typecheck、build 均通过；只对本次文件做格式修复。
- [x] 按 executing-plans 做一次独立只读审查，限定本轮文件与上方 Review Focus；保存结果，重要发现先复现再修复并验证。复核 git diff/status 和新文件，不包含凭据／运行时数据／调试残留，保留用户原有改动。工程验证通过后才请求真实 42 次验收授权，不直接执行。

## 真实效果验收与交付

授权后最多 42 次，不运行默认测试、worker、迁移或数据库任务；输出合成报告到仓库外新文件。按设计第 7 节门槛核对：明确目的 18 项至少 13 个正确自动选择，自动选择零错误；解读 18 项牌名／方向／牌位正确率 18/18，额外牌位／技术字段标题／确定读心或预测为零；至少 17/18 质量总分 >=5 且无单项 0，截图圣三角例必须达标。不得按关键词预筛直接宣称通过。

未获得授权、配置不可用、取消或供应商失败时准确记录未完成，不扩大调用次数，不把代码／mock 检查当作效果证据。最终报告只列本轮结果、文件、验证、发布需前后端配套与外部未验收项。
