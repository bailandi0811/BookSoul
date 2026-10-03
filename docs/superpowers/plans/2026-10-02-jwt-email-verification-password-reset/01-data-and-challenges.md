# Plan 01：数据模型与认证挑战 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行方式由用户选择；未经要求不提交或创建分支。

**Goal:** 提供可安全签发、限流、验证和一次性消费的认证挑战基础，保留旧用户与业务数据。

**Architecture:** 在现有 Prisma 模型中做增量扩展；AuthChallengesService 负责密码学与事务状态，不负责 HTTP 或 SMTP。用单行邮箱 / 用途记录及 generation 管理重发与配额。

**Tech Stack:** Node 22.19.x、NestJS 11、Prisma 6.19.3 / PostgreSQL、node:crypto、Jest。

**Spec:** [共同设计基线](../../specs/2026-10-02-jwt-email-verification-password-reset-design.md)。

执行记录（2026-10-03）：实现、测试命令、实际结果与未执行项见[验收记录](../../../auth-email-acceptance.md)及[总览状态](README.md)。下方 checkbox 是原验收清单；未逐项完成的外部步骤不勾为通过。

## Global Constraints

- OTP 6 位、10 分钟、5 次错误；重置 Token 32 随机字节、30 分钟。
- 同邮箱 / 用途冷却 60 秒、固定 1 小时最多签发 5 次；OTP HMAC-SHA256、Reset SHA256。
- 旧用户 `emailVerifiedAt = null`、`authVersion = 0`；不改 ID 或业务记录，不连接应用数据库测试。
- 只新增迁移，不修改旧迁移；配置读取契约由 Plan 02 完成，不修改真实 `.env`。

## Review Focus

- 同时发码绕过配额：Task 2 原子锁与有界发送次数测试，Plan 06 实际数据库并发确认。
- 第 5 次错误因异常回滚而不累计：Task 3 使用结果而非事务内抛错，验证计数提交。
- 上一封迟到邮件复活旧码：Task 2 验证 generation 的 compare-and-set。
- OTP / Reset 跨用途消费：Task 3 验证用途、邮箱、userId 绑定与 SENT 状态。
- 测试 URL 缺失 / 同库 / 非测试 schema：Task 1 在连接前拒绝。

---

## 背景、影响与风险

背景：当前只有 User 与 RefreshToken，缺少验证状态和一次性挑战。6 位数字空间很小，数据库泄漏后普通 SHA256 可被枚举，因此需要独立密钥的 HMAC。

影响：扩展 User 和新认证表，公开用户对象增加 nullable 验证时间；现有登录准入规则不改变，不新增 HTTP endpoint。Plan 03 / 04 消费此服务，Plan 02 的调用方按固定接口回写交付状态。

风险：锁顺序导致死锁、过期边界判断、错误计数回滚、测试误连真实库。默认 mock 只能验证调用与状态约束，不能证明 PostgreSQL 竞态或迁移在真实数据上的表现。

## 前置条件与交付物

无额外前置功能。先读 schema、auth.service、PrismaService 与 server/package.json。交付新迁移、服务及无外部依赖的测试；不执行应用库迁移。隔离 DB 用例可在已授权且满足门禁后执行，否则明确未运行。

**Scope：** 本文件列出的认证基础与测试门禁文件；无 HTTP endpoint / SMTP 接入。修改既有 Jest 配置前展示新增排除 / 专用发现差异，按 AGENTS.md 配置规则确认，不读取或改写 `.env`。

### Task 1：增量模型与数据库测试安全门禁

**Files:**

- Modify: `server/prisma/schema.prisma`（User 与认证挑战模型）
- Create: `server/prisma/migrations/20261002090000_auth_email_challenges/migration.sql`（仅新增列、表、索引、约束）
- Create: `server/src/prisma/testing/isolated-database.ts`
- Create/Test: `server/src/prisma/testing/isolated-database.spec.ts`
- Modify: `server/src/prisma/prisma.service.spec.ts`（复用门禁，不改变已有 fixture 范围）
- Modify: `server/package.json`（默认 Jest 排除 `\\.db\\.spec\\.ts$`）
- Modify: `server/test/jest-db.json`（专用发现既有 Prisma 测试及 auth DB 测试，兼容 Windows / Linux 路径）
- Create/Test: `server/src/auth/auth-challenges.db.spec.ts`（仅专用 DB 命令执行）

**Interfaces:**

- Produces: `resolveIsolatedDatabaseUrl(env: { TEST_DATABASE_URL?: string; DATABASE_URL?: string }): string`；纯校验函数，不读取 `.env`，不打印 URL。
- Produces: 基线中的 User / AuthChallenge 字段及 Prisma 枚举；供后续服务使用。

- [ ] 写门禁失败测试：缺失任一 URL、非法协议 / URL、非 `*_test` 库、非 `test_*` schema、host / 默认端口 / database / schema 全部相同均抛错；有效不同目标返回原 TEST_DATABASE_URL。敏感 URL 不出现在异常文本。
  关键用例 `it('rejects missing application URL before connect')`：`expect(() => resolveIsolatedDatabaseUrl({TEST_DATABASE_URL: testUrl})).toThrow()`，同时 `expect(connect).not.toHaveBeenCalled()`。
- [ ] 在 `server/` 运行 `npm test -- --runInBand src/prisma/testing/isolated-database.spec.ts`，预期因门禁函数不存在而失败，不能因联网失败而红。
- [ ] 实现门禁并复用到既有 DB spec；只允许 postgresql / postgres 协议，比较完整目标，无法确定是否独立时拒绝。DB 测试 guard 成功后才实例化 Prisma，并显式传 test URL；需要已有 spec 临时覆盖进程变量时先保存应用 URL，不丢失对比依据。
- [ ] 按基线扩展模型及新 SQL；新增 CHECK 约束保证 generation / attempts / sendCount 非负，默认值与 nullable 状态符合旧账号兼容。不得增加旧用户已验证的 UPDATE。
- [ ] 写隔离 DB 约束用例：旧形态建用户后字段为 null / 0，email + purpose 唯一，不同用途可共存，重复 secretHash 被拒绝，删除本次 fixture 用户的外键策略符合约定。只清理本次创建的 ID / 前缀。
- [ ] 修改测试发现配置，专用配置采用下面的 testRegex；运行 `npm test -- --listTests --runInBand`：列表不得含 auth 的 `.db.spec.ts` 或 `prisma.service.spec.ts`；运行 `npm run test:db -- --listTests`：必须实际列出既有 Prisma 与新增 auth-challenges.db.spec.ts，不能把空发现列表当通过，且不连接数据库。

```json
"testRegex": "(?:prisma[/\\\\]prisma\\.service|auth[/\\\\].*\\.db)\\.spec\\.ts$"
```
- [ ] 运行门禁测试至 PASS。生成客户端只用 `npm run prisma:generate`；迁移 SQL 离线编写 / 审查，不运行 `prisma migrate dev/reset`。实际 migrate deploy 仅在核对隔离测试目标并获相应操作授权后执行。

### Task 2：密码学、原子签发与交付状态

**Files:**

- Create: `server/src/auth/auth-challenge.types.ts`（共享内部类型，完整采用基线）
- Create: `server/src/auth/auth-challenge.crypto.ts`（秘密生成与摘要）
- Create: `server/src/auth/auth-challenges.service.ts`
- Create/Test: `server/src/auth/auth-challenge.crypto.spec.ts`
- Create/Test: `server/src/auth/auth-challenges.service.spec.ts`

**Interfaces:**

- Consumes: `ConfigService.get<string>('auth.challengeSecret')`（Plan 02 提供映射）；PrismaService。
- Produces: `generateOtp(): string`、`generateResetToken(): string`、`digestOtp(secretKey: string, context: {id: string; generation: number; purpose: string; email: string}, code: string): string`、`digestResetToken(token: string): string`。
- Produces: 基线中的 `issue(target, clock)`、`markDelivery(id, generation, state)`；`secret` 仅存在 PreparedChallenge，不能写入 Prisma data 或 HTTP receipt。

- [ ] 写失败测试，固定随机与时间，锁定下列断言：

```ts
// it('binds a six-digit OTP to purpose and the exact expiry policy')
expect(generateOtp()).toMatch(/^\d{6}$/); // 包含 000000
expect(digestOtp(key, context, '000123')).not.toBe('000123');
expect(digestOtp(key, {...context, purpose: 'EMAIL_VERIFICATION'}, '000123'))
  .not.toBe(digestOtp(key, context, '000123'));
expect(prepared.expiresAt.getTime() - now.getTime()).toBe(600_000);
expect(prepared.resendAllowedAt.getTime() - now.getTime()).toBe(60_000);
```

- [ ] 运行 `npm test -- --runInBand src/auth/auth-challenge.crypto.spec.ts src/auth/auth-challenges.service.spec.ts`，确认因实现缺失而失败。
- [ ] 实现标准库随机、无歧义 HMAC、reset 摘要。HMAC key 使用 64 位 hex 配置解码；缺失 / 不合规返回 503，不能 fallback 使用 JWT 密钥；摘要比较使用等长 Buffer + timingSafeEqual。
- [ ] 实现事务签发：首次通过参数化 INSERT ON CONFLICT 建立占位行，再 SELECT FOR UPDATE 锁 `(email,purpose)`；锁后调用 clock 获取时间并检查配额，更新新的 randomUUID verificationId、generation、摘要、有效期、attempts=0、consumedAt=null、PENDING 与发送窗口。内部 id 不变；60 秒内和窗口第 6 次返回基线 429 / 剩余秒数；一小时边界重置窗口。
- [ ] 补测试：重发后 generation 加 1、verificationId 改变、内部 id 不变，旧 receipt 即使数字恰好相同也拒绝；reset TTL 为 1_800_000 毫秒；晚到的旧 generation SENT / FAILED 更新 count=0；队列入队失败时当前 generation FAILED；不把明文 secret、完整邮箱或密钥传给 logger。
- [ ] 运行上述两个相关测试至 PASS，查看只包含预期变更的 diff。

### Task 3：可组合的验证与一次性消费

**Files:**

- Modify: `server/src/auth/auth-challenges.service.ts`
- Test: `server/src/auth/auth-challenges.service.spec.ts`
- Modify/Test: `server/src/auth/auth-challenges.db.spec.ts`（增加真实行锁 / 原子消费用例，运行仍须隔离门禁）

**Interfaces:**

- Produces: 基线的 `verify(tx, proof, clock)`、`consume(tx, challenge, clock)`、`findResetTarget(secret)`。
- Consumes: 调用方拥有的 Prisma 事务；已有账号业务须先锁 User，再调用 verify，避免逆序锁。

- [ ] 写失败测试：时间恰好等于 expiresAt 拒绝；等待锁期间过期也拒绝；verify 后 consume 前过期不能成功；第 5 次错误 increments 到 5 且事务返回 invalid 后提交；第 6 次不再验证；用途 / 邮箱 / userId 错配不通过；PENDING / FAILED / SUPPRESSED 不通过；正确码不能在第二次 consume 成功。
  关键用例 `it('rejects an OTP that expires while waiting for its row lock')`：锁等待期间将 fake clock 推至 expiresAt，`await expect(service.verify(tx, proof, clock)).resolves.toEqual({status:'invalid'})`。
- [ ] 运行挑战服务测试，确认新验证用例失败；保留签发测试。
- [ ] 实现锁内验证并返回 ChallengeVerification，锁后调用 clock，失败计数不通过抛异常回滚。正确时不在 verify 提前消费；consume 再取当前时间，原子匹配 generation、SENT、未消费、有效期后更新 consumedAt，count 必须为 1。
- [ ] 实现 findResetTarget：先校验 32 字节 base64url Token 的规范形状，查 SHA256 摘要且限制 PASSWORD_RESET / 已绑定用户；无效返回 null，任何 OTP 不可走该入口。
- [ ] 补 DB 用例：两个事务竞争同一个 proof，最终最多一次消费；业务事务回滚不消费；错误次数落库。该项 mock 通过不能代替真实数据库结果。
- [ ] 运行 `npm test -- --runInBand src/auth/auth-challenges.service.spec.ts src/prisma/testing/isolated-database.spec.ts` 至 PASS；重查默认 listTests 后运行 `npm run check`。

### Task 4：共享输入策略与用户元数据契约

**Files:**

- Create/Test: `server/src/auth/auth-input.policy.ts`、`server/src/auth/auth-input.policy.spec.ts`
- Modify: `server/src/users/users.service.ts`
- Create/Test: `server/src/users/users.service.spec.ts`
- Modify/Test: `server/src/auth/auth.service.ts`、`server/src/auth/auth.service.spec.ts`（仅公开用户序列化，不改签发流程）
- Modify/Test: `server/src/auth/auth.controller.spec.ts`、`server/src/auth/protected-features.spec.ts`（只同步真实响应契约 / fixture）

**Interfaces:**

- Produces: `normalizeEmail(email: string): string`、`assertNewPasswordPolicy(password: string): void`（不足 8 字符 / 超过 72 UTF-8 字节抛 BadRequestException）。Plan 03 / 04 共用，不修改旧 LoginDto。
- Produces: `PublicUser = {id: string; email: string; name: string; emailVerifiedAt: string | null}`。
- Produces: `toPublicUser(user: Pick<User, 'id' | 'email' | 'name' | 'emailVerifiedAt'>): PublicUser`，显式 Date → ISO；既有 AuthService 序列化委托此函数。
- Produces: `UsersService.findAuthStateById(id: string): Promise<{user: PublicUser; authVersion: number} | null>`；单次 select，不选 passwordHash。既有 findPublicById 保留，通过相同映射返回 PublicUser。

- [ ] 写失败测试：邮箱仅 trim + lowercase；8 字符合法密码可通过；不足 8 字符和 76 字节多字节密码拒绝；公开结果含 null / ISO 时间且不含 authVersion / passwordHash；内部 auth-state 查询返回版本。
  关键用例 `it('preserves provider address semantics and enforces bcrypt bytes')`：`expect(normalizeEmail(' Reader+tag@Example.com ')).toBe('reader+tag@example.com')`；`expect(() => assertNewPasswordPolicy('😀'.repeat(19))).toThrow()`。
- [ ] 运行 `npm test -- --runInBand src/auth/auth-input.policy.spec.ts src/users/users.service.spec.ts src/auth/auth.service.spec.ts`，新断言应先失败。
- [ ] 实现共享策略与元数据映射；仅同步受影响 fixture 的默认 `authVersion: 0` / `emailVerifiedAt: null`，不删除已有登录、刷新与隔离断言。
- [ ] 运行相关测试至 PASS，检查默认发现后运行 `npm run check`。跨端字段为新增 nullable 字段，旧 client 应忽略未知字段；正式消费由 Plan 05 完成。

## 验证与完成条件

- [ ] 单测覆盖本文件 Review Focus；默认质量门无数据库和 SMTP 连接。
- [ ] schema 与新迁移一致，现有迁移未改，用户 / 业务表未清理。
- [ ] 可交给 Plan 03 / 04 使用的服务签名与共同基线一致。
- [ ] 专用 DB 验收如获授权且环境就绪，运行 `npm run test:db -- --runTestsByPath src/auth/auth-challenges.db.spec.ts`；否则记录“未执行真实 DB 约束 / 竞态验证”。
- [ ] 未执行应用数据库迁移，未修改 `.env`；实际命令结果与剩余风险写入交付记录。
