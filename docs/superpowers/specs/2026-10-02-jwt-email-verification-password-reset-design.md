# JWT 邮箱验证与找回密码：计划设计基线

状态：六份计划的实现与本地验收已完成；用户随后回传隔离数据库专用用例全部通过的输出，并确认验证码 / 登录及找回 / 改密基本流程正常，实际证据与来源限制见[认证验收记录](../../auth-email-acceptance.md)。其余真实邮件联调用例和发布验收未完成，不能标总体验收通过。仓库事实核对日期：2026-10-03。

## 背景与目标

当前书魂使用 NestJS JWT、数据库中的 Refresh Token 和 React 认证页面。注册直接创建账号，尚无邮箱归属验证或密码找回。SMTP 已用于用户确认后的阅读笔记邮件，但配置写在 `ToolsModule` 中，不能让认证模块直接依赖该模块而形成循环依赖。

本期补齐账号生命周期，沿用现有 JWT、HttpOnly Refresh Cookie 和用户 ID，保留用户的书籍、会话和记忆归属。完成意味着用户可以验证邮箱后注册、为旧账号补验证、通过邮件链接重置密码，并在重置后使之前的登录凭证失效。

已确认的产品选择：

1. 继续使用当前 JWT 方案，不接入 Better Auth。
2. 新注册在当前页面输入邮件中的 **6 位验证码**；服务端验证成功后才创建账号。
3. 找回密码使用邮件中的重置链接，改密成功后回到普通登录。
4. 现有未验证账号仍可正常登录，仅提示补验证；保留原账号、密码和所有业务数据。

范围不包含社交登录、无密码登录、邮箱变更、重做 Token 存储、强制旧账号验证、注销账号或终止已经开始的 SSE。改密撤销保证作用于后续鉴权和刷新请求。

## 建议实施参数

以下数值是本次计划采用的建议默认值，不代表已部署配置。调整时先改本基线，再同步对应测试，避免六份计划分别采用不同值。

| 项目 | 默认值与规则 |
| --- | --- |
| 注册 / 补验证 OTP | `crypto.randomInt(0, 1_000_000)`，补零为 6 位，10 分钟有效 |
| OTP 错误次数 | 每次签发最多 5 次；第 5 次错误后拒绝继续验证 |
| 邮件重发 | 同一规范化邮箱、同一用途间隔至少 60 秒；固定 1 小时窗口最多 5 次，窗口到期后重置 |
| 重置 Token | `randomBytes(32).toString('base64url')`，30 分钟有效，单次使用 |
| IP 限流 | 新的发码、重置申请、补验证确认、重置提交接口分别 10 次 / 60 秒；已有注册 8 次 / 60 秒、登录与刷新规则保留 |
| 密码 | 新注册 / 新密码至少 8 个字符，并限制 UTF-8 实际字节数不超过 bcrypt 的 72 字节；bcrypt cost 保留 10；既有登录输入规则不收紧 |
| 邮箱 | 沿用 `trim().toLowerCase()`；不合并 Gmail 点号或 `+` 地址 |
| 邮件派发 | 应用内有界队列：并发 2，最多 100 个未完成任务；不自动重试；SMTP 沿用现有连接、握手和 socket 超时 |

不新增生产依赖。邮件队列负责让 HTTP 申请不等待 SMTP，不能宣称具有持久消息队列的送达保证。进程退出时未完成的验证码保持不可用，用户可在冷却后重发；邮件服务或队列异常必须记录稳定错误事件。第一期不增加 Redis、外部邮件供应商或持久邮件 outbox。

## 数据和安全不变量

### 用户与挑战记录

`User` 增加 `emailVerifiedAt DateTime?` 和 `authVersion Int @default(0)`。迁移后旧用户分别是 `null` 和 `0`；不替换用户 ID，不自动标记验证成功，不修改业务表或旧密码哈希。

新增 `AuthChallenge`、`AuthChallengePurpose` 与 `AuthChallengeDeliveryState`，用途固定为 `REGISTRATION`、`EMAIL_VERIFICATION`、`PASSWORD_RESET`。一行代表一个 `(email, purpose)` 当前挑战及发送配额；重发覆盖当前秘密，递增 `generation`，之前的码 / 链接失效。

最小字段：`id String @default(uuid())`、`verificationId String @unique @default(uuid())`、`email`、`purpose`、`userId String?`、`generation Int`、`secretHash String @unique`、`expiresAt`、`attempts Int`、`consumedAt?`、`deliveryState`、`resendAllowedAt`、`windowStartedAt`、`sendCount Int`、`createdAt`、`updatedAt`。唯一约束 `(email, purpose)`，索引 `expiresAt`。`userId` 为用户外键，删除策略 Cascade，User 添加反向 `authChallenges` 关系；注册挑战允许为空。ID 使用 UUID 格式的字符串，SQL 外键列沿用现有 User.id 的 TEXT 类型，不顺手改成 PostgreSQL UUID 列。交付状态为 `PENDING | SENT | FAILED | SUPPRESSED`，只有 `SENT` 可以消费。

`id` 是稳定的内部行 ID；`verificationId` 是每次签发重新生成的 UUID，只有它进入发码 receipt。重发后旧 verificationId 必须拒绝，即使随机生成的数字恰好相同，也不能重用旧证明。

OTP 的存储值为 HMAC-SHA256，密钥来自独立的 `AUTH_CHALLENGE_SECRET`，按 64 位十六进制文本解码为 32 字节 key。摘要输入明确包含 `id / generation / purpose / email / code`，使用无歧义的 JSON 数组编码。不可只对 6 位数字做普通 SHA256。重置 Token 为高熵随机值，存 SHA256 摘要即可。原始秘密只在生成、邮件派发和本次客户端提交期间存在，不存数据库或日志。

签发时在事务中按 `(email, purpose)` 建行并锁行，检查发送窗口及冷却，再更新整组挑战字段。不能用进程内 Map 作为邮箱级限流事实源。派发成功 / 失败仅能更新匹配 `id + generation + PENDING` 的行，防止上一封迟到邮件覆盖本次状态。

验证必须检查用途、邮箱、用户绑定、未消费、交付状态、有效期和次数。锁获取后调用时钟获取当前时间，消费前再次获取，不能用进入事务前的时间接受已经过期的挑战。错误次数的更新必须提交；不能在事务内抛错把计数回滚。正确验证与账号创建 / 验证状态更新 / 改密，在同一个事务中消费挑战，业务写入失败则消费也回滚。

### 共享内部接口

以下接口是计划间的交接契约，实施时放在 `server/src/auth/auth-challenge.types.ts`，不作为 HTTP 返回值：

```ts
type OtpPurpose = 'REGISTRATION' | 'EMAIL_VERIFICATION';
type ChallengePurpose = OtpPurpose | 'PASSWORD_RESET';
type AuthClock = () => Date;
type ChallengeTarget = { email: string; purpose: ChallengePurpose; userId: string | null };
type PreparedChallenge = ChallengeTarget & {
  id: string; verificationId: string; generation: number; secret: string;
  expiresAt: Date; resendAllowedAt: Date;
};
type ChallengeProof = ChallengeTarget & { verificationId: string; secret: string };
type VerifiedChallenge = ChallengeTarget & { id: string; generation: number };
type ResetChallengeTarget = {
  id: string; verificationId: string; email: string;
  purpose: 'PASSWORD_RESET'; userId: string;
};
type ChallengeVerification =
  | { status: 'valid'; challenge: VerifiedChallenge }
  | { status: 'invalid' };
type ChallengeReceipt = {
  verificationId: string; expiresInSeconds: number; resendAfterSeconds: number;
};
```

`AuthChallengesService` 由 Plan 01 提供：

```ts
issue(target: ChallengeTarget, clock: AuthClock): Promise<PreparedChallenge>;
verify(tx: Prisma.TransactionClient, proof: ChallengeProof, clock: AuthClock): Promise<ChallengeVerification>;
consume(tx: Prisma.TransactionClient, challenge: VerifiedChallenge, clock: AuthClock): Promise<boolean>;
findResetTarget(secret: string): Promise<ResetChallengeTarget | null>;
markDelivery(id: string, generation: number, state: 'SENT' | 'FAILED' | 'SUPPRESSED'): Promise<void>;
```

`clock` 在业务调用时传 `() => new Date()`，测试传假时钟函数。`verify` 按 verificationId + 用途 / 邮箱 / 绑定用户定位并在调用方事务内锁挑战行；`consume` 使用内部 id 匹配版本、状态和未消费条件做原子更新。只有 `PASSWORD_RESET` 的摘要查找可返回 findResetTarget，且结果保证 userId 非空；重置 proof 的 verificationId 取该结果，不由客户端指定账号。所有数据库 SQL 使用 Prisma 参数化接口。

邮箱配额错误使用 429 `{statusCode:429, message:'发送过于频繁，请稍后重试', code:'AUTH_RATE_LIMITED', retryAfterSeconds:N}`，N 为当前冷却 / 窗口剩余秒数的向上取整。IP 限流保留 Throttler 标准错误；前端缺等待信息时显示错误并使用 60 秒体验冷却，不替代服务端控制。

### 密码与凭证

新 Access Token 必须带 `authVersion`。JWT Strategy 在原有用户查询中获取数据库当前版本并比较，不增加第二次查询。旧 Token 缺少版本时仅按 `0` 处理；数据库版本大于 `0` 时拒绝。负数、小数、字符串版本以及错误类型一律拒绝。

重置事务的锁顺序固定为 **User → AuthChallenge → RefreshToken**，完成：再次验证挑战 → 修改 bcrypt 哈希 → `authVersion + 1` → 吊销该用户全部未吊销 Refresh Token → 消费重置挑战。不修改 `emailVerifiedAt`，旧账号补验证仍使用独立流程。

登录签发和 Refresh Token 轮换同样先锁 User 行。登录在锁内重新核对用于验密的 `passwordHash` / `authVersion` 快照；快照改变则拒绝本次登录，不根据陈旧密码签发新版本凭证。刷新先用摘要定位 userId，锁 User 后重新读取并验证 Refresh Token，再轮换。重置之后不得遗留可用的旧链条后继 Token。

签名使用事务中读取的版本快照；即使提交后才签名、期间发生改密，签出的旧版本也会被 Strategy 拒绝。保留现有 Refresh Token 重放链条吊销、Cookie 安全属性及请求所有权边界。既有 logout-all 语义不在本期顺手扩展。

## 邮件与配置

将 SMTP 配置抽到 `server/src/mail/mail.module.ts`，由 ToolsModule 与 AuthModule 复用。认证邮件服务只提供验证码、重置链接、改密通知三种固定模板，收件人来自已验证 DTO / 服务端用户记录，不接受任意 HTML、任意链接或模型输出。阅读笔记发送仍要求原来的用户确认。

2026-10-03 按用户要求增加品牌 HTML 正文，同时保留原纯文本版本。三种固定模板共用书魂品牌排版和内嵌 PNG Logo，不依赖外部图片或字体；验证码保留前导零，重置按钮和备用链接都来自上述受信任客户端地址。插入正文 / 属性的动态内容须转义，主题和隐藏邮件预览不包含验证码或完整重置链接。此调整只改变邮件展示，不改变认证接口、有效期、配额或凭证失效规则。

`AuthMailDispatcher.enqueue(job: () => Promise<void>): void` 由 Plan 02 提供，满队列同步抛可识别的服务不可用错误；派发 Promise 都有错误处理。以真实 SMTP 操作的结束释放槽位，不用 `Promise.race` 假装取消外部发送。测试使用可控 Promise，真实验证另行授权。

发码服务先检查全局配置和队列容量，创建 PENDING 挑战，提交派发任务；HTTP 返回的是“申请已受理”，不承诺已经投递。任务开始时已过期则标 FAILED，不再发送无效邮件。邮件失败设置 FAILED 并记录脱敏错误，未投递的码不可消费；迟到的旧 generation 不可复活。队列满导致未入队时也将对应挑战标记失败。

找回密码对存在 / 不存在邮箱都执行同样的输入校验、配额检查和挑战签发并返回相同响应。不存在邮箱的挑战 `userId = null`，后台标记 SUPPRESSED，不发送邮件。用户存在时后台发出重置邮件，SMTP 时延 / 失败不进入 HTTP 响应。申请本身不修改密码、版本或已有登录。配额拒绝仍对两类邮箱一致。

新增配置建议：

- `AUTH_CHALLENGE_SECRET`：使用 `randomBytes(32).toString('hex')` 生成的独立随机密钥，配置为 64 位十六进制文本；与 JWT 密钥不同，示例文件只写占位说明。
- `AUTH_PUBLIC_BASE_URL`：受信任的客户端部署地址；生产 HTTPS，本地允许 localhost / 127.0.0.1 的 HTTP；禁止凭据、query、fragment。
- SMTP 继续使用现有 `SMTP_*`。缺少必要设置时新邮件功能返回 503，既有登录 / 刷新和阅读笔记的原有可用性策略不受影响。

配置源码、校验与示例文件的具体变更在 Plan 02 列明后，按 AGENTS.md 第 7、9 节确认再实施；不自动修改真实 `.env` 或部署环境。重置地址只能由受信任配置构造：`<base>/#reset-password?token=<random-token>`（保留配置中的部署子路径），不得使用请求 Host 或客户端提供的跳转地址。

## HTTP 契约

成功外层沿用 `{ success: true, data: ... }`。失败沿用 Nest 异常形状，在需要区分的地方附加稳定 `code`。新增字段只出现在公开用户对象中，密码哈希、authVersion 和 Refresh Token 不进入响应 body。

`PublicUser` 增加 `emailVerifiedAt: string | null`，返回 ISO 时间或 null。登录 / 注册 / 刷新仍返回 `{ accessToken, user }` 并设置原来的 Refresh Cookie；`me` 仍返回 `{ user }`。

| Endpoint（统一前缀 `/api/auth`） | 输入与身份 | 成功结果 | 拒绝条件 |
| --- | --- | --- | --- |
| POST `/registration-code` | `{email}`，公开 | 202，`ChallengeReceipt` | 非法邮箱 400；邮箱配额 / IP 超限 429；全局配置 / 队列不可用 503 |
| POST `/register` | `{name,email,password,verificationId,code}`，公开 | 201，现有登录结果；新用户已验证 | 无效 / 错误 / 过期码 400 `INVALID_VERIFICATION_CODE`；证明邮箱归属后发现已注册 409 `EMAIL_ALREADY_REGISTERED` |
| POST `/email-verification/code` | JWT，无 body 邮箱 | 202，`ChallengeReceipt` | 已验证 409 `EMAIL_ALREADY_VERIFIED`；配额 / 配置错误同上 |
| POST `/email-verification/confirm` | JWT，`{verificationId,code}` | 200，`{user}` | 绑定不匹配 / 无效码 400；未登录 401 |
| POST `/forgot-password` | `{email}`，公开 | 202，`{message: '如果该邮箱已注册，将收到重置邮件，请检查邮箱或稍后重试。', resendAfterSeconds: 60}` | 仅格式、配额、全局服务可用性错误；不暴露账号是否存在 |
| POST `/reset-password` | `{token,newPassword}`，公开 | 200，`{message: '密码已重置，请重新登录。'}`；清除当前浏览器 Refresh Cookie | 无效 / 过期 / 已用 Token 400 `INVALID_RESET_TOKEN`；密码不合规 400；不自动登录 |

密码重复输入由前端校验；服务端仍独立验证新密码。GET 打开重置页面不消费 Token，也不变更账号。邮件扫描器访问链接不会改密。

## 前端契约

复用 AuthPage、AccountSection、auth-api 和 useAuthStore；保持现有主题和无路由库结构。增加独立 ForgotPasswordForm、ResetPasswordPage、EmailVerificationForm，避免一个认证组件承担所有状态。

验证码请求成功保存 verificationId 和服务端冷却时间。邮件地址变化清空验证码 / challenge，不能携带旧证明注册新地址；旧异步响应不能覆盖新地址的状态。倒计时仅用于体验，服务端仍限流。

旧用户 `emailVerifiedAt` 缺失的持久化数据显示为未验证提示，但不阻塞登录；`me` 刷新服务器状态。补验证成功仅更新当前用户元数据，不清空书架、不触发认领或更换用户 ID。

重置页优先于会话恢复和书架显示。解析 fragment 后立即通过 history.replaceState 清除地址中的秘密，Token 只保存在页面内存，不存 localStorage、不进遥测。成功后清理本地认证并触发原有私有缓存失效事件，回登录页；不先依赖旧凭证登出接口。失败保留可行动提示，不自动登录或跳入另一用户的书架。

客户端增加不持久化的 authGeneration；signIn、clearAuthentication、进入重置流程时递增，正常同用户 refresh / me 更新不递增。登录 / 恢复 / 自动刷新响应提交前比较捕获的 generation，变化则丢弃；补验证还检查 userId。共享刷新 Promise 继续单飞，取消一个等待者不能取消其他合法等待者的刷新。陈旧 refresh 返回内部 `superseded` 状态，不清当前新会话、不重试旧请求。

## 验证与发布边界

所有默认 Jest / Vitest 使用假时钟、数据库 mock 和邮件 mock。数据库事务竞态需要独立 DB 验收，不能只凭 mock 测试声称竞态已解决。DB 测试采用 `.db.spec.ts` 命名并从默认 Jest 发现中排除，通过 `test:db` 专用配置发现。

隔离数据库必须显式提供 TEST_DATABASE_URL，并用当前应用 DATABASE_URL 作完整 host / port / database / schema 比对。缺失、非法、同目标或无法证明隔离时，在连接前拒绝。只允许独立 `*_test` 库与 `test_*` schema。fixture 按本次创建 ID / 唯一前缀清理，不执行无条件删除、reset、drop 或 truncate。

先迁移扩展 schema，再部署对应服务代码。新注册强制验证码是公开契约变化，需要同一发布窗口交付后端与前端；不能只发布后端使旧注册页失效。上线前单独确认真实环境配置、迁移目标、SMTP 发信目的地及允许的数据流。规划和默认测试不授权生产部署或真实发信。

回退只回退应用代码并保留扩展列 / 表，不删除挑战表或用户数据。**发生过改密之后，不得回退到忽略 authVersion 的旧鉴权代码**，否则旧 JWT 重新可用；需保留版本校验或经确认全局轮换 JWT 密钥使旧凭证失效。密钥轮换不在本次默认执行范围。

安全依据：[OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)、[OWASP Email Validation and Verification Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html)。旧账号继续使用属于本项目明确选择的兼容策略，不能把历史 null 当作已验证。
