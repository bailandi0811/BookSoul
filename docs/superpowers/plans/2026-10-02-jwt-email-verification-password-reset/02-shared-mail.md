# Plan 02：共享 SMTP 与认证邮件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行方式由用户选择；未经要求不提交或创建分支。

**Goal:** 在不影响阅读笔记确认发信的前提下，提供受约束的认证邮件模板、可信重置链接和有界后台派发。

**Architecture:** 提取现有 MailerModule 配置到共享 MailModule；认证业务调用独立 AuthMailService 与 AuthMailDispatcher，避免 AuthModule / ToolsModule 循环依赖。接口不接受任意邮件正文或跳转地址。

**Tech Stack:** NestJS 11、现有 @nestjs-modules/mailer / nodemailer、ConfigService、Jest；无新生产依赖。

**Spec:** [共同设计基线](../../specs/2026-10-02-jwt-email-verification-password-reset-design.md)。

执行记录（2026-10-03）：实现、测试命令、实际结果与未执行项见[验收记录](../../../auth-email-acceptance.md)及[总览状态](README.md)。下方 checkbox 是原验收清单；未逐项完成的外部步骤不勾为通过。

## Global Constraints

- 沿用现有 SMTP 连接 / greeting / socket 超时；真实发信需单独授权。
- 邮件队列并发 2、最多 100 个未完成任务、无自动重试；所有 Promise 有失败处理。
- 独立 AUTH_CHALLENGE_SECRET 与受信任 AUTH_PUBLIC_BASE_URL；不修改真实 `.env`。
- ToolsService 原有 `confirmed === true` 校验继续存在；不向 Agent 暴露认证发信工具。

## Review Focus

- Host / redirect 参数注入重置地址：Task 2 只使用受信任配置并测试恶意 URL。
- SMTP 卡住拖延找回响应：Task 3 用可控 Promise 测试入队不等待发送、槽位有界。
- 配置缺失导致旧登录启动失败：Task 1 保持原有启动兼容，邮件功能调用时拒绝。
- 邮件正文插入用户 HTML / 密码：Task 2 固定纯文本模板，不接受自由正文。
- 抽模块后绕过阅读笔记确认：Task 1 保留原服务与 DTO 拒绝路径。

---

## 背景、影响与风险

背景：现有 ToolsModule 配置 SMTP 且依赖 AuthModule；认证再导入 ToolsModule 会形成循环。实际有两个稳定使用方，共享邮件基础设施有明确职责。

影响：邮件配置归属移动，新认证模板和派发能力可单独被测试；阅读笔记的确认与认证边界不变。Plan 03 / 04 接入后才产生验证码和找回邮件。

风险：SMTP 超时或拒绝、发信频率导致供应商限额、应用内队列在重启时丢失待发任务、配置 URL 错误。默认 mock 无法证明 DNS、SMTP 授权码、收件或垃圾邮件分类。

## 前置条件与配置审查

独立于 Plan 01 实现；测试不调用 Prisma。配置修改前展示以下具体差异并按仓库约定确认：新增两个配置映射与校验、示例文件增加非秘密占位说明、现有 SMTP 配置原样移动。不替换邮件供应商，不写实际密钥，不修改 CORS / 部署设置。

**Scope：** 共享 SMTP、认证模板 / 派发及其测试和配置示例；不实现注册 / 重置 endpoint，不产生真实邮件。

### Task 1：提取共享邮件模块并保持原路径兼容

**Files:**

- Create: `server/src/mail/mail.module.ts`（现有 MailerModule.forRootAsync 配置与导出）
- Modify: `server/src/tools/tools.module.ts`（改为导入共享模块）
- Modify: `server/src/config/configuration.ts`（auth.challengeSecret / auth.publicBaseUrl）
- Modify/Test: `server/src/config/env.validation.ts`、`server/src/config/env.validation.spec.ts`
- Modify: `server/.env.example`（只有占位说明；配置改动确认后实施）
- Create/Test: `server/src/mail/mail.module.spec.ts`
- Test: `server/src/tools/tools.service.spec.ts`（复用既有测试；不为重命名写镜像测试）

**Interfaces:**

- Produces: `MailModule` 导出 `MailerModule`，其他模块继续注入 `MailerService`。
- Produces: `ConfigService.get<string>('auth.challengeSecret')`、`get<string>('auth.publicBaseUrl')`。

- [ ] 先写失败测试：module 编译只使用 mock MailerService / ConfigService；原确认邮件未 confirmed 时不调用 SMTP；未配置邮件时保持服务不可用错误。
  关键用例 `it('keeps confirmed-email permission after extracting MailModule')`：提交原有有效 fixture 但 confirmed=false，`expect(mailer.sendMail).not.toHaveBeenCalled()`，且服务拒绝而非返回成功。
- [ ] 在 `server/` 运行 `npm test -- --runInBand src/mail/mail.module.spec.ts src/tools/tools.service.spec.ts src/config/env.validation.spec.ts`，新增模块相关断言应因实现缺失而失败，不能初始化真实 transport。
- [ ] 完成配置变更审查后原样搬移 SMTP host、port、secure、auth、from 和 3 个 timeout 的映射；禁止 AuthModule 导入 ToolsModule。保持 ToolsService 的确认、鉴权和错误处理。
- [ ] 配置校验：字段未提供 / 空示例时旧登录仍可启动；非空 challengeSecret 必须为 64 位 hex 且不同于 JWT_ACCESS_SECRET；非空 baseUrl 校验 URL 规则。格式不能证明密钥随机性，部署说明要求 randomBytes(32) 生成，不记录值。
- [ ] 运行上述相关测试至 PASS。既有 env validation 断言不删除、不弱化；真实 `.env` 无改动。

### Task 2：固定模板、受信任地址与可观察错误

**Files:**

- Create: `server/src/auth/auth-mail.service.ts`
- Create/Test: `server/src/auth/auth-mail.service.spec.ts`
- Modify: `server/src/auth/auth.module.ts`（导入 MailModule，注册服务）

**Interfaces:**

```ts
type OtpMailInput = { email: string; code: string; purpose: 'REGISTRATION' | 'EMAIL_VERIFICATION' };
assertConfigured(kind: 'otp' | 'reset'): void;
sendOtp(input: OtpMailInput): Promise<void>;
sendResetLink(input: {email: string; token: string}): Promise<void>;
sendPasswordChanged(input: {email: string}): Promise<void>;
buildResetUrl(token: string): string;
```

- [ ] 写失败测试：验证码纯文本为 6 位且声明 10 分钟；重置信声明 30 分钟；通知信无密码 / Token；配置基地址含部署子路径时保留子路径；输入 Host 无法改变产物。
  关键用例 `it('builds the reset URL only from the configured deployment path')`：配置 `https://booksoul.example/app/`，`expect(service.buildResetUrl(token)).toBe('https://booksoul.example/app/#reset-password?token=' + token)`。
- [ ] 运行 `npm test -- --runInBand src/auth/auth-mail.service.spec.ts`，确认因服务缺失而失败。
- [ ] 实现固定 subject + text 模板，使用 DTO / 数据库确定的邮箱。验证码或 Token 不拼进 subject，不接受用户提供的正文；assertConfigured 对缺少 from / SMTP auth 返回 503，otp 还需有效 challengeSecret，reset 还需有效 publicBaseUrl，不泄露配置值。
- [ ] buildResetUrl 只从 auth.publicBaseUrl 创建 URL，将 Token 放 fragment；拒绝 javascript、外站 HTTP、URL 凭据、query、fragment 和未配置地址。配置允许的生产 HTTPS 域名本身是运营信任边界，不从请求输入自动学习。
- [ ] send 方法发送失败抛稳定业务错误，上层派发记录事件；不能 log 原始 SMTP error（可能含地址 / 凭据）、完整收件人、验证码或完整重置 URL。
- [ ] 补注入 / 缺失配置 / 拒绝发送测试，断言 MailerService 仅收到固定 text 且无危险 HTML；运行相关测试至 PASS。

### Task 3：有界派发与失败处理

**Files:**

- Create: `server/src/auth/auth-mail-dispatcher.service.ts`
- Create/Test: `server/src/auth/auth-mail-dispatcher.service.spec.ts`
- Modify: `server/src/auth/auth.module.ts`

**Interfaces:**

- Produces: `AuthMailDispatcher.assertCapacity(): void`、`enqueue(job: () => Promise<void>): void`；总容量包含运行中任务，满时抛 503。
- Consumes: job 内调用 AuthMailService；Plan 03 / 04 的 job 自己调用挑战 markDelivery，dispatcher 捕获并记录遗漏的失败，防止 unhandled rejection。
- Produces: Nest 生命周期 `onApplicationShutdown(): Promise<void>`，框架正常关闭时停止接收新任务，丢弃未开始任务，等待运行任务由真实 SMTP timeout 结束；未完成挑战保持 PENDING 且不可消费。进程突然退出仍可能丢任务，不新增全局 shutdown / 部署配置来宣称可靠投递。

- [ ] 写失败测试，提交 3 个可控 Promise job：前 2 个执行，第 3 个等待；enqueue 立即返回；释放一个后才运行第 3 个；第 101 个未完成任务同步拒绝。
  关键用例 `it('runs at most two jobs and rejects the 101st unfinished job')`：`expect(startedJobs).toHaveLength(2)`；装满 100 个后 `expect(() => dispatcher.enqueue(extraJob)).toThrow()`。
- [ ] 运行 dispatcher 单测，确认因实现缺失而失败。
- [ ] 实现队列与 finally 释放槽位。job 失败记录 `AUTH_MAIL_DELIVERY_FAILED` 的脱敏事件，不重试；容量 / 停机拒绝使用可识别错误；不通过 Promise.race 提前释放仍在发送的 job。
- [ ] 补失败 / 停机测试：一个 job reject 不阻塞后续，不出现 unhandled rejection；停止后新任务拒绝，等待任务不再启动；实际运行的任务只有在完成 / 超时之后才结束。
- [ ] 运行 `npm test -- --runInBand src/auth/auth-mail-dispatcher.service.spec.ts src/auth/auth-mail.service.spec.ts src/tools/tools.service.spec.ts` 至 PASS；核对默认测试发现范围后运行 `npm run check`。

## 验证与完成条件

- [ ] 邮件能力可在没有数据库与 SMTP 网络的情况下独立验证。
- [ ] Templates、URL 规则、队列容量和确认发送回归全部通过，Auth / Tools 无循环依赖。
- [ ] 所有配置变更有具体差异及相应确认记录；实际 `.env` 与部署设置保持原样。
- [ ] 没有宣称队列可持久恢复或 SMTP 成功代表收件箱送达。
- [ ] 真实 SMTP 验收移交 Plan 06；本计划只用 mock，没有向真实邮箱发送任何消息。
