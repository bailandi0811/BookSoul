# Plan 04：找回密码与旧凭证失效 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行方式由用户选择；未经要求不提交或创建分支。

**Goal:** 用户通过一次性邮件链接重置密码，并使该账号改密之前的 Access / Refresh Token 在后续请求失效。

**Architecture:** 密码重置服务组合挑战与固定邮件能力；JWT 使用用户 authVersion，签发、刷新和重置共享 User 行锁。重置事务一次完成密码修改、版本递增、刷新凭证吊销和挑战消费。

**Tech Stack:** NestJS / Prisma / PostgreSQL、bcryptjs cost 10、HS256 JWT、node:crypto、Jest / Supertest。

**Spec:** [共同设计基线](../../specs/2026-10-02-jwt-email-verification-password-reset-design.md)。

执行记录（2026-10-03）：实现、测试命令、实际结果与未执行项见[验收记录](../../../auth-email-acceptance.md)及[总览状态](README.md)。下方 checkbox 是原验收清单；未逐项完成的外部步骤不勾为通过。

## Global Constraints

- 重置 Token 32 随机字节、30 分钟、单次使用；服务器只存 SHA256。
- 新密码至少 8 字符 / 不超过 72 UTF-8 字节；申请重置不锁账号、不改密码和版本。
- 申请返回统一文案 / 202，SMTP 不进入响应耗时；新公开 route 各 10 次 / 60 秒。
- User → AuthChallenge → RefreshToken 固定锁序；旧无版本 JWT 仅允许数据库版本 0。
- 改密后普通登录，不自动签发新登录凭证，不改 emailVerifiedAt 或业务数据。

## Review Focus

- 不存在邮箱通过响应、SMTP 异常或时间泄露：Task 1 返回统一 ack，异步 SMTP。
- 邮件扫描器 GET 访问即改密：Task 1 / 3 只在 POST reset 消费，高熵秘密不作登录 JWT。
- 改密与刷新同时产生存活后继：Task 2 / 3 同锁序与再次读取；Plan 06 实际 DB 双排序验收。
- 旧密码已验通过、等待期间发生改密：Task 2 锁内重新核对快照，不签发当前版本 Token。
- 双击 / 并发重置重复成功或中途只改密码：Task 3 全部写入同事务，最多一次成功。

---

## 背景、影响与风险

背景：当前 Access Token 没有版本，删除 Refresh Token 后旧 JWT 仍有效直到过期；refresh 事务也未对 User 串行化。只加 reset endpoint 或只吊销 RT，不能完成改密后的旧凭证失效目标。

影响：新增两个公开 endpoint，AccessTokenPayload 增加版本，Strategy 使用 Plan 01 的单次 auth-state 查询；登录 / 刷新内部事务调整，外部 response / Cookie 保持原约定。

风险：重复请求、行锁死锁、陈旧密码快照、版本兼容错误、签名落在事务提交后时的新旧版本竞态。保证针对之后的鉴权；已开始的 SSE 不在本期终止。真正竞态必须用 Plan 06 的数据库用例验证。

## 前置条件与交付物

需要 Plan 01 的 Challenge / PublicUser / auth-state / 输入策略，以及 Plan 02 的邮件与派发接口；不依赖 Plan 03 的 UI 或路由。交付独立重置服务、版本策略、改密事务和模拟测试，真实数据库并发另列验收。

**Scope：** 密码重置、版本鉴权及必要登录 / 刷新事务保护；不扩展 logout-all 语义、不改 SSE 生命周期。挑战服务时间参数统一传 `() => new Date()`。

### Task 1：统一找回申请与固定邮件链接

**Files:**

- Create: `server/src/auth/dto/forgot-password.dto.ts`
- Create: `server/src/auth/dto/reset-password.dto.ts`
- Create: `server/src/auth/auth-password-reset.service.ts`
- Create/Test: `server/src/auth/auth-password-reset.service.spec.ts`
- Modify: `server/src/auth/auth.controller.ts`、`server/src/auth/auth.module.ts`
- Modify/Test: `server/src/auth/auth.controller.spec.ts`

**Interfaces:**

- Produces: `AuthPasswordResetService.requestReset(email: string): Promise<{message: string; resendAfterSeconds: number}>`。
- Produces: ForgotPasswordDto `{email}`（规范化 / IsEmail / maxlength 254）；ResetPasswordDto `{token,newPassword}`（严格 Token 形状、密码政策）。
- Consumes: Plan 01 `issue / markDelivery`；Plan 02 `assertConfigured('reset') / assertCapacity / enqueue / sendResetLink`。

- [ ] 写失败测试：已存在 / 不存在邮箱完全相同 202 body，SMTP pending 或 reject 不改变 ack；两类邮箱都执行配额；请求不写 passwordHash / authVersion / RT；配置缺失 / 满队列两类都 503。
  关键用例 `it('does not reveal account existence or wait for SMTP')`：`expect(existingResponse.status).toBe(202)`；`expect(existingResponse.body).toEqual(missingResponse.body)`；`expect(prisma.user.update).not.toHaveBeenCalled()`。
- [ ] 在 `server/` 运行 `npm test -- --runInBand src/auth/auth-password-reset.service.spec.ts src/auth/auth.controller.spec.ts`，确认新增 requestReset / route 缺失导致失败。
- [ ] 对每次合法邮箱申请同样查询用户、签发 PASSWORD_RESET（userId 为用户 ID 或 null），检查配额，返回基线精确文案。不存在目标的 job 标 SUPPRESSED；存在时 job 固定邮件成功标 SENT，失败标 FAILED 并脱敏记录。
- [ ] HTTP 不 await SMTP，不在账号不存在分支加特殊状态码；只返回“如果已注册”，不假称已投递。job 开始时已过期则 FAILED 且不发邮件；不暴露 challenge 或 Token，不从 Host / body 建 reset URL。
- [ ] 补静态 Token 格式、缺配置、入队失败、晚到 generation 的测试，运行相关测试至 PASS；确认只 POST 接口修改挑战，GET 不消费账号凭证。

### Task 2：版本校验及登录 / 刷新的串行化

**Files:**

- Modify: `server/src/auth/auth.types.ts`（AccessTokenPayload.authVersion?，旧 Token 过渡）
- Modify: `server/src/auth/jwt.strategy.ts`
- Create/Test: `server/src/auth/jwt.strategy.spec.ts`
- Modify: `server/src/auth/auth.service.ts`（login、issueTokens、refresh、signAccessToken）
- Modify/Test: `server/src/auth/auth.service.spec.ts`、`server/src/auth/protected-features.spec.ts`
- Create: `server/src/auth/auth-user-lock.ts`（唯一共享行锁 helper，不创建第二套认证）
- Create/Test: `server/src/auth/auth-user-lock.spec.ts`

**Interfaces:**

- Consumes: `UsersService.findAuthStateById(id)`；共享 PublicUser。
- Produces: `lockAuthUser(tx: Prisma.TransactionClient, userId: string): Promise<User | null>`，参数化 SELECT User FOR UPDATE，在锁后读取最新完整 User。
- Produces: 新 JWT payload `{sub,email,type:'access',authVersion:user.authVersion}`；Strategy validate 返回 PublicUser，不返回版本。
- Produces: `JwtStrategy.validate(payload: unknown): Promise<PublicUser>`，先验证 unknown，便于直接测试恶意类型，不使用 any / ts-ignore。
- Existing: `login(LoginDto): Promise<AuthData>`、`refresh(refreshToken: string): Promise<AuthData>` 外部签名不变。
- Internal: `private issueTokens(snapshot: User): Promise<AuthData>` 拥有登录发 RT 的事务；login 只验密后调用它，不再包第二层事务。`private signAccessToken(user: User): Promise<string>` 使用传入的版本快照。

- [ ] 写失败测试，锁定版本边界：

```ts
// it('rejects a pre-reset or malformed auth version')
// 在完整签名/expiry 校验之外测试 validate；缺字段仅是兼容旧 JWT。
await expect(strategy.validate({...payload, authVersion: 0})).resolves.toEqual(publicUser);
// 数据库改为 1 后：旧 0、缺字段、'1'、-1、1.5 全部 401；整数 1 可通过。
expect(publicUser).not.toHaveProperty('authVersion');
```

- [ ] 运行 Strategy / AuthService 新测试，确认原 Strategy 没有版本拒绝逻辑而失败。
- [ ] 实现一次用户查询 + 严格非负整数版本比较；无版本仅映射 0，类型错误不能 Number() 隐式接受。已删除用户拒绝，仍保留 type/sub/email 与 HS256/expiry 校验。
- [ ] 实现共享 User 锁 helper。login 仍使用已有 dummy bcrypt 防存在性时差；保存验密 user 快照，在发 RT 的事务内先锁 User，比较 passwordHash / authVersion 快照；改变时返回原通用登录失败，不重新签发。
- [ ] refresh 先用摘要定位 userId，不把此次读取当作授权；事务先锁 User，锁后取当前时间，再重新读取 RT 并检查过期 / 吊销，再原子 claim 与 replacement。保留既有 replay 链条吊销，所有后继归同一用户锁保护；等待锁期间 RT 已过期也拒绝，添加假时钟回归。
- [ ] 对注册后的 issueTokens 路径同样使用读取的用户版本，避免无版本新 Token；与 Plan 03 的注册事务接口整合时不再次重复创建初始 RT。
- [ ] 补可控事务测试：reset 发生在旧密码 compare 后则 login 拒绝且 RT 不创建；被吊销 RT 在锁后重读拒绝；签名使用捕获版本，不能在提交后读最新版本给旧凭证“升级”。
- [ ] 运行 `npm test -- --runInBand src/auth/jwt.strategy.spec.ts src/auth/auth-user-lock.spec.ts src/auth/auth.service.spec.ts src/auth/protected-features.spec.ts` 至 PASS。

### Task 3：一次性改密事务与失效语义

**Files:**

- Modify: `server/src/auth/auth-password-reset.service.ts`
- Modify: `server/src/auth/auth.controller.ts`（POST reset-password，成功清 refresh cookie）
- Test: `server/src/auth/auth-password-reset.service.spec.ts`
- Modify/Test: `server/src/auth/auth.controller.spec.ts`
- Modify: `server/README.md`（重置、版本兼容、有效性边界）

**Interfaces:**

- Consumes: `findResetTarget(token)` → `ResetChallengeTarget`（非空 userId 和当前 verificationId）；`lockAuthUser`；`verify / consume`；`assertNewPasswordPolicy`。proof 取 target 的 email / userId / verificationId，purpose 固定 PASSWORD_RESET，secret 为 dto.token。
- Produces: `resetPassword(dto: ResetPasswordDto): Promise<void>`；无 accessToken / refreshToken 返回。Controller 使用原 Cookie 选项 clearCookie，成功 body 为共同基线文案。

- [ ] 写失败测试：Token 不存在 / 过期 / 已用 / 交付失败均不改任何用户状态；有效 Token 修改哈希、版本只加 1、仅吊销该用户 RT、消费挑战；确认不会自动设 emailVerifiedAt。
  关键用例 `it('updates password, revokes credentials and consumes reset proof together')`：`expect(userAfter.authVersion).toBe(userBefore.authVersion + 1)`；`expect(activeRefreshTokensForTarget).toHaveLength(0)`；`expect(challengeAfter.consumedAt).not.toBeNull()`；另一用户的 active RT 数量不变。
- [ ] 运行 password-reset / controller 测试，确认 reset 行为缺失而失败。
- [ ] 验证新密码政策并在锁前计算 bcrypt 哈希；摘要定位挑战目标后事务先锁 User，再 verify proof。invalid 用结果返回，事务外抛 INVALID_RESET_TOKEN。
- [ ] 在同一事务依序修改 passwordHash / increment authVersion、按 userId 吊销全部未吊销 RT、consume；任何 count 或写入错误均回滚全部更新，不能用 finally 提交消费。
- [ ] 提交成功后返回 200、清当前浏览器 Refresh Cookie；以队列发送无秘密的改密通知。SMTP 失败、队列满或停机拒绝均不回滚已提交密码，也不把成功改密误报成失败；捕获并记录 AUTH_PASSWORD_CHANGED_NOTICE_FAILED，相关拒绝路径需测试。
- [ ] 补事务中间失败与并发约束 mock 测试：版本更新或 RT 吊销失败时挑战未消费、密码不部分更新；两个相同 Token 不允许两次成功。真实锁 / 并发结果移交 Plan 06，不将 mock rollback 当数据库证明。
- [ ] 运行 `npm test -- --runInBand src/auth/auth-password-reset.service.spec.ts src/auth/auth.service.spec.ts src/auth/jwt.strategy.spec.ts src/auth/auth.controller.spec.ts` 至 PASS；核对默认发现后运行 `npm run check`。

## 验证与完成条件

- [ ] 新 / 旧版本 Token 规则、密码政策、普通登录返回、Cookie 属性测试通过。
- [ ] 申请不变更账号，改密事务一次性完成全部安全写入，不误清其他用户 RT。
- [ ] 重置与刷新、旧密码登录竞态有对应拒绝路径；真实竞态在 Plan 06 中单独记录结果。
- [ ] 未验证实际 SMTP 收件、实际 PG 锁行为时准确披露；不声称中断已有 SSE。
- [ ] 发布回退不得恢复忽略 authVersion 的旧代码，此限制传递到 Plan 06 的发布清单。
