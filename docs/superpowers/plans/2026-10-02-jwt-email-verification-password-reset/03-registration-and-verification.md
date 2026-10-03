# Plan 03：验证码注册与旧账号补验证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行方式由用户选择；未经要求不提交或创建分支。

**Goal:** 新用户证明邮箱归属后才能注册，旧用户继续正常登录并可为自己的账号补验证。

**Architecture:** 扩展现有 AuthController / AuthService；签发挑战后后台发送固定邮件，验证与用户写入在同一数据库事务完成。补验证从可信 AuthContext 反查用户邮箱，不接受 body 指定目标账号。

**Tech Stack:** NestJS 11、Prisma、bcryptjs、现有 Throttler / JWT Guard、Jest / Supertest。

**Spec:** [共同设计基线](../../specs/2026-10-02-jwt-email-verification-password-reset-design.md)。

执行记录（2026-10-03）：实现、测试命令、实际结果与未执行项见[验收记录](../../../auth-email-acceptance.md)及[总览状态](README.md)。下方 checkbox 是原验收清单；未逐项完成的外部步骤不勾为通过。

## Global Constraints

- 注册验证码 6 位、10 分钟、5 次错误，重发 60 秒 / 每小时 5 次。
- 新注册验证码必须由后端验证；补验证不强制旧用户退出，不改变用户 ID。
- 新密码至少 8 字符且不超过 72 UTF-8 字节，bcrypt cost 10。
- 新发码 / 补验证接口 10 次 / 60 秒；保留注册 8 次 / 60 秒及登录 / 刷新既有规则。
- 默认测试 mock Prisma / SMTP，不修改真实配置，不单独发布破坏旧前端的后端注册接口。

## Review Focus

- 直接调用 register 绕开验证 UI：Task 2 验证缺码 / 错码时不建用户、不签发凭证。
- 已注册邮箱探测：Task 1 不因是否注册而改变发码响应；Task 2 归属证明通过后才返回冲突。
- 用户 A 为 B 补验证：Task 3 按 AuthContext 绑定邮箱与 userId，body 越界字段拒绝。
- 验证码计数在事务异常中被回滚：Task 2 / 3 返回 invalid 后在事务外抛 400。
- 旧账号验证为空被限制登录或丢数据：Task 3 保留 null 用户登录，验证前后 ID 与业务归属不变。

---

## 背景、影响与风险

背景：现有 register 直接创建 User，别人可用不属于自己的邮箱占位。先验证再创建可以避免生成一批未验证正式账号。旧账号按已确认选择继续使用，验证状态只能作提示。

影响：register 新增 verificationId / code，为明确的契约变化；新增公开注册发码与两个登录态补验证接口。登录 / refresh / me 的用户验证字段来自 Plan 01。

风险：重复注册竞争、发码与 SMTP 状态竞态、误给旧账号加登录门槛、验证码跨用途使用。新注册上线必须与 Plan 05 同步，SMTP 缺配置时不能假成功注册。

## 前置条件与独立验证

Plan 01 的挑战、输入策略、PublicUser 已交付，Plan 02 的 AuthMailService / Dispatcher 已交付。可单独用 narrow Nest testing module + mock 证明 HTTP 行为，不启动完整 AppModule。真正的注册事务并发由 Plan 06 的 DB 验收证明。

**Scope：** 发码 / 验码注册 / 当前用户补验证及相关服务、DTO、测试；无前端和部署操作。时间参数统一传 `() => new Date()`，不传事务开始前的 Date 快照。

### Task 1：注册发码 endpoint 与后台派发

**Files:**

- Create: `server/src/auth/dto/request-registration-code.dto.ts`
- Create: `server/src/auth/auth-email-verification.service.ts`
- Create/Test: `server/src/auth/auth-email-verification.service.spec.ts`
- Modify: `server/src/auth/auth.controller.ts`、`server/src/auth/auth.module.ts`
- Modify/Test: `server/src/auth/auth.controller.spec.ts`

**Interfaces:**

- Consumes: Plan 01 的 `issue / markDelivery / normalizeEmail`；Plan 02 的 `assertConfigured / assertCapacity / enqueue / sendOtp`。
- Produces: `AuthEmailVerificationService.requestRegistrationCode(email: string): Promise<ChallengeReceipt>`；Controller POST `/registration-code` 返回 202。
- Produces: `RequestRegistrationCodeDto {email: string}`；IsEmail、最大 254 字符、规范化输入，与现有 DTO 的校验策略一致。

- [ ] 写失败测试：格式非法 400；正常发码返回 verificationId / 600 秒有效期 / 60 秒重发时间；已注册和未注册邮箱同样发码受理；不提前创建 User；SMTP Promise 未完成 HTTP 已返回。
  关键用例 `it('accepts a registration code request without creating an account')`：`expect(response.status).toBe(202)`；`expect(response.body.data.expiresInSeconds).toBe(600)`；`expect(prisma.user.create).not.toHaveBeenCalled()`。
- [ ] 在 `server/` 运行 `npm test -- --runInBand src/auth/auth-email-verification.service.spec.ts src/auth/auth.controller.spec.ts`，确认新增测试因方法 / route 缺失而失败。
- [ ] 实现全局配置与容量检查、规范化、REGISTRATION / userId=null 的签发与 fixed OTP job。job 成功标 SENT，失败标 FAILED；入队失败也标当前 generation FAILED 后抛 503。
- [ ] receipt 只返回本次 verificationId 和秒数，不能返回内部 id 或 secret；job 开始时已过期则 FAILED 且不发邮件；job 内失败不得 log 整个 PreparedChallenge；迟到任务使用内部 id + generation 更新状态。
- [ ] 补 429、503、SMTP 失败、旧任务迟到测试，运行相关测试至 PASS。异步发送错误必须有脱敏事件，202 的 UI 文案使用“申请已受理”。

### Task 2：邮箱证明与原子注册

**Files:**

- Modify: `server/src/auth/dto/register.dto.ts`
- Modify: `server/src/auth/auth.service.ts`（register；其余签发流程暂保留，Plan 04 统一加版本保护）
- Modify/Test: `server/src/auth/auth.service.spec.ts`、`server/src/auth/auth.controller.spec.ts`

**Interfaces:**

- Consumes: `verify(tx, proof, clock)` / `consume(tx, challenge, clock)`；`assertNewPasswordPolicy`。
- Produces: `RegisterDto` 增加 UUID `verificationId` 和 ASCII 6 位字符串 `code`；`register(dto: RegisterDto): Promise<AuthData>` 签名保留。
- Proof 固定 `{verificationId: dto.verificationId, email: normalizeEmail(dto.email), purpose:'REGISTRATION', userId:null, secret:dto.code}`。

- [ ] 写失败测试：缺码 DTO 400；无效码 / 过期 / 5 次错误 / 补验证码均不创建 User 或 RefreshToken，不返回 accessToken；有效码创建已验证账号并返回原登录结果。
  关键用例 `it('rejects direct registration without valid mailbox proof')`：`expect(response.status).toBe(400)`；`expect(prisma.user.create).not.toHaveBeenCalled()`；`expect(jwt.signAsync).not.toHaveBeenCalled()`。
- [ ] 运行 auth service / controller 测试，确认验证相关断言先失败。
- [ ] 保留共享密码政策与 bcrypt cost 10，哈希在业务事务前计算；事务内先 verify，invalid 用结果返回、外部抛 `INVALID_VERIFICATION_CODE`，确保错误次数提交。
- [ ] valid 时在同一事务创建 User（emailVerifiedAt=now）、创建初始 RefreshToken、consume；返回提交后的用户与原始 Refresh Token，签名失败不能返回成功。唯一冲突映射 EMAIL_ALREADY_REGISTERED，发生冲突回滚消费与用户写入。
- [ ] 重复邮箱检查只在证明有效之后；不在 HTTP register 的第一步暴露其存在。禁止先建账号再在另一个事务消费 OTP。
- [ ] 补并发 / 回滚的 mock 约束测试：模拟 Prisma P2002、consume count=0 或 RT 创建失败时整体事务失败，不签发成功。真实并发与锁语义交给 Plan 06。
- [ ] 运行相关测试至 PASS；原 Cookie 名、httpOnly、secure、sameSite、path 和响应 envelope 断言继续通过。

### Task 3：登录态补验证与旧账号兼容

**Files:**

- Create: `server/src/auth/dto/confirm-email-verification.dto.ts`
- Modify: `server/src/auth/auth-email-verification.service.ts`
- Modify: `server/src/auth/auth.controller.ts`（仅新路由使用既有 JWT Guard / AuthContext）
- Test: `server/src/auth/auth-email-verification.service.spec.ts`
- Modify/Test: `server/src/auth/auth.controller.spec.ts`、`server/src/auth/auth.service.spec.ts`
- Modify: `server/README.md`（记录新契约、旧账号兼容；不要标注尚未完成的整体上线）

**Interfaces:**

- Produces: `requestCurrentUserCode(userId: string): Promise<ChallengeReceipt>`。
- Produces: `confirmCurrentUserEmail(userId: string, dto: {verificationId: string; code: string}): Promise<PublicUser>`。
- HTTP userId 仅从可信 AuthContext 传入，两个请求 body 不接受 email / userId；确认路由返回 200 `{user}`。

- [ ] 写失败测试：未登录 401；额外 userId / email 字段由 whitelist + forbidNonWhitelisted 拒绝；A 的上下文 + B 的 challenge 无效；注册用途码不能补验证；已验证申请 409。
  关键用例 `it('does not allow user A to verify a challenge bound to user B')`：`expect(response.body.code).toBe('INVALID_VERIFICATION_CODE')`；`expect(prisma.user.update).not.toHaveBeenCalled()`。
- [ ] 运行 email-verification / controller 测试，确认新增路由与绑定逻辑缺失导致失败。
- [ ] 服务端反查用户，按当前邮箱及 userId 签发 EMAIL_VERIFICATION；确认事务先锁 User，读取当前邮箱，再 verify / 更新 emailVerifiedAt / consume；invalid 在事务外抛错误，成功通过 toPublicUser 返回。
- [ ] 并发补验证后重复 confirm 使用已消费码应拒绝；不改变密码、authVersion 或已登录凭证，不写 Books / Chat / Memory。
- [ ] 补旧账号回归：emailVerifiedAt=null 登录成功；补验证前后 id 相同、既有书籍归属查询仍用原 id；成功时间来自服务器，不相信客户端时间或 persisted 标记。
- [ ] 运行 `npm test -- --runInBand src/auth/auth.service.spec.ts src/auth/auth.controller.spec.ts src/auth/auth-email-verification.service.spec.ts` 至 PASS，核对默认发现后 `npm run check`。

## 验证与完成条件

- [ ] 每条新 route 的状态码、输入、限流与错误 code 符合共同基线。
- [ ] 绕过、用途混用、跨用户、计数落库语义和旧用户准入都有明确断言。
- [ ] SMTP / DB 为 mock；真实邮件与事务竞态未运行时明确标注，不能把 mock 回滚视作 PostgreSQL 证据。
- [ ] 新注册接口尚未单独部署；前端升级与发布验收分别等待 Plan 05 / 06。
