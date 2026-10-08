# 运行时 Agent 与 Skill 管理

本规范用于 BookSoul 服务端运行职责，不管理 Codex/Claude 开发工具的全局技能。设计依据见[绑定设计](superpowers/specs/2026-10-06-agent-skill-binding-design.md)。

## 绑定与使用

唯一生产注册与绑定表位于 `server/src/agent-skills/agent-skill.catalog.ts`。当前规则内容仍在业务拥有的 `server/src/tarot/` 中，管理层不复制策略文字。

- `tarot-selector` 绑定 `tarot-spread-selection`，固定入口为 `TarotProviderService.classify`，使用 `loadTarotSelectionSkill()`。
- `tarot-interpreter` 绑定 `tarot-reading`，固定入口为 `buildTarotReadingMessages`，使用 `loadTarotReadingSkill(spread)`；仅公共规则与当前牌阵规则进入 system 消息。
- 其他运行职责没有上述绑定，不能直接导入规则或固定入口。skill 不按问题关键词、全局目录或链接自动发现。

关闭自动触发只控制何时调用。授权隔离还要求：列举仅返回当前角色绑定的元数据、内容加载前拒绝越权、固定身份不能被用户/模型参数替换、未授权规则不进入上下文。内部访问对象不向业务公开。

元数据访问不加载策略；CLI 只能取得规定的版本元数据，业务入口拿到的数据递归复制并冻结，不与其他运行共享可修改对象。当前没有新增缓存、历史或数据库。

## 接入新 Skill

1. 在所属业务模块维护规则，定义稳定 id、version、description、kind 及纯加载函数。当前支持 choice-policy/prompt-rules，不支持执行任意代码或自动加载外部文件。
2. 在内部 catalog 注册定义。只注册不代表授权，未绑定 skill 默认无法列举或加载。
3. 显式绑定允许的 Agent；多个消费者要分别授权，不存在全局继承。增加固定身份端口，不能接受用户或模型提供的自由 Agent ID。
4. 在指定业务入口授权加载后，按已确认的信任层次注入策略。skill 不能重写权限、调用其他 skill 或自行取得工具。
5. 更新源码边界白名单，明确允许导入的文件与符号；不得新增任意身份工厂、转导出桶文件或通用 skill 模型工具。
6. 补充拒绝路径、零加载/零外部调用、上下文不污染、返回对象不污染等测试；运行相关 Jest 和 `server/npm run check`。

纯管理重构保留策略内容及规则版本；规则行为变化才更新对应版本并增加效果回归。日志只记录固定 Agent/Skill ID、版本与既有运行指标，不输出规则正文、私人问题、牌面或凭据。

## 解绑与错误

解绑时更新 catalog 中的 binding、固定端口及调用方；验证角色看不到元数据且加载被拒绝。不增加热更新机制，部署后新运行使用新代码与绑定表。

- `AGENT_SKILL_AGENT_UNKNOWN`：未知运行身份。
- `AGENT_SKILL_UNKNOWN`：未知 skill。
- `AGENT_SKILL_FORBIDDEN`：未绑定或固定端口不允许的使用。
- `AGENT_SKILL_CATALOG_INVALID`：目录、绑定或纯数据契约缺陷。

这些是内部工程错误，不作为供应商 unavailable 静默兜底，不开放新的 HTTP skill 管理接口。

## 边界与验证

`agent-skill.boundaries.spec.ts` 使用 TypeScript AST 和项目模块解析，检查生产源码及规定的验收脚本。保护原规则、内部访问模块和固定角色端口；直接导入、转导出、require/import() 绕过或违规动态加载会使默认测试失败。

相关验证：`node node_modules/jest/bin/jest.js --runInBand agent-skill tarot-agent-skills tarot`（在 server 中）。默认测试不连接数据库或调用真实模型；完整质量门执行前仍须遵守 AGENTS.md 的数据库安全门禁。

这是可信服务端代码中的应用和上下文隔离，不是操作系统沙箱。任意恶意后端代码、任意文件读取或任意代码执行工具可超出这一边界。本轮不授予这些能力；未来若运行不可信 skill，必须另行设计进程、文件和网络限制，不能仅用清单或提示词宣称安全。
