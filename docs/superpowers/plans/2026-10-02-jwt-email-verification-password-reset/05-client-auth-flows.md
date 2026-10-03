# Plan 05：前端邮箱验证与密码找回 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行方式由用户选择；未经要求不提交或创建分支。

**Goal:** 用户能在现有书魂界面完成验码注册、旧账号补验证、申请找回和邮件链接改密。

**Architecture:** 复用 auth-api / useAuthStore / AuthPage，按表单职责拆分组件；重置链接通过 App 的轻量页面选择处理，无新路由依赖。表单使用显式提交状态、请求取消与陈旧响应检查。

**Tech Stack:** React 19、TypeScript、Zustand、现有 API fetch、Vitest / happy-dom / react-dom。

**Spec:** [共同设计基线](../../specs/2026-10-02-jwt-email-verification-password-reset-design.md)。

执行记录（2026-10-03）：实现、测试命令、实际结果与未执行项见[验收记录](../../../auth-email-acceptance.md)及[总览状态](README.md)。下方 checkbox 是原验收清单；未逐项完成的外部步骤不勾为通过。

## Global Constraints

- 注册 OTP 为 6 位字符串；倒计时按服务端秒数，初始冷却 60 秒，不在前端生成证明。
- 重置 Token 放 fragment，读取后清 URL，只存页面内存，不持久化密码 / OTP / Token。
- 旧持久化账号缺 emailVerifiedAt 视为 null，不阻塞登录；以服务器 me / confirm 结果更新。
- 新密码至少 8 字符且 UTF-8 字节数不超过 72；旧登录规则保持兼容。
- 保持现有主题、输入框防自动填充约定和 401 单飞刷新；不引入生产依赖。

## Review Focus

- 发码后换邮箱或切换页面：Task 2 取消 / 丢弃旧响应并清空旧 challenge。
- 后台标签页倒计时不准：Task 2 用 deadline 与 Date.now 计算，不按 tick 数递减。
- 已登录用户打开 reset link 仍被送进书架：Task 4 reset 页面优先于 authReady / isAuthenticated。
- 补验证响应迟到覆盖另一用户：Task 1 / 3 更新时检查当前 userId。
- 改密成功后旧私有缓存或旧恢复请求重新出现：Task 4 取消恢复、清认证并沿用失效事件。

---

## 背景、影响与风险

背景：当前 AuthPage 只有登录 / 注册，App 按会话与书架状态决定页面，没有 router。现有 apiFetch 已处理 Cookie、自动刷新和跨标签页刷新锁，应继续复用。

影响：仅修改认证组件、认证 API / store 与 App 页面选择；书籍上传、对话与记忆业务组件无需修改。补验证只更新用户元数据，成功改密才触发认证和私有缓存失效。

风险：切换账号与异步响应竞争、链接 Token 泄漏到地址 / 存储、旧持久化数据兼容、以假 countdown 绕过真实限流。UI mock 测试不能证明邮件收件或服务端安全性。

## 前置条件与独立交付

可以根据共同基线及 mock fetch 单独开发；真正联调需要 Plan 03 / 04。使用现有 react-dom/createRoot + act 进行交互测试，不为本期安装测试库。字段展示遵循现有中文文案和样式。

**Scope：** 认证 UI、API / store、必要的 App 页面选择与旧请求失效处理；不改书籍 / 对话业务组件，不更换路由、Token 存储或主题。

### Task 1：API 类型、错误与认证元数据

**Files:**

- Modify/Test: `client/src/lib/auth-api.ts`、`client/src/lib/auth-api.test.ts`
- Modify/Test: `client/src/lib/api.ts`、`client/src/lib/api.test.ts`（刷新结果提交及跨身份重试保护）
- Modify/Test: `client/src/store/useAuthStore.ts`、`client/src/store/useAuthStore.test.ts`

**Interfaces:**

```ts
type LoginInput = {email: string; password: string};
type RegisterInput = LoginInput & {name: string; verificationId: string; code: string};
type ChallengeReceipt = {verificationId: string; expiresInSeconds: number; resendAfterSeconds: number};
type RequestOptions = {signal?: AbortSignal};
authenticate(mode: 'login', input: LoginInput, options?: RequestOptions): Promise<AuthTokens>;
authenticate(mode: 'register', input: RegisterInput, options?: RequestOptions): Promise<AuthTokens>;
requestRegistrationCode(email: string, options?: RequestOptions): Promise<ChallengeReceipt>;
requestCurrentUserVerificationCode(options?: RequestOptions): Promise<ChallengeReceipt>;
confirmCurrentUserEmail(input: {verificationId: string; code: string}, options?: RequestOptions): Promise<AuthUser>;
requestPasswordReset(email: string, options?: RequestOptions): Promise<{message: string; resendAfterSeconds: number}>;
resetPassword(input: {token: string; newPassword: string}, options?: RequestOptions): Promise<void>;
```

- AuthUser 新增 `emailVerifiedAt: string | null`；store 新增 `updateCurrentUser(user: AuthUser): void`，仅在当前 id 相同才更新。
- store 新增非持久化 `authGeneration: number` 和 `invalidatePendingAuthentication(): void`（仅递增，不清当前账号）；signIn / clearAuthentication 同样递增，restoreSession / 元数据更新不递增。
- `refreshAuthentication(options?: RequestOptions): Promise<AuthenticationRefreshStatus>` 新增内部状态 `'superseded'`；`restoreAuthentication(options?: RequestOptions): Promise<AuthRestoreStatus>` 同样可返回 `'superseded'`。
- `AuthFlowError extends Error`：`constructor(message: string, details?: {code?: string; retryAfterSeconds?: number})`；`readAuthFlowError(response: Response): Promise<AuthFlowError>` 保留 Nest message，不把所有错误统一成“验证码错误”。

- [ ] 写失败测试：发码 / 找回 / 重置使用对应 URL 与 skipAuth / skipRefresh；补验证带当前 bearer，不在 body 传邮箱或 userId；注册必带 proof；Token / OTP 不写 localStorage。
  关键用例 `it('discards a refresh response after reset invalidates the session')`：旧 refresh 暂停，成功 reset 后再释放，`expect(useAuthStore.getState().user).toBeNull()`，`expect(refreshStatus).toBe('superseded')`。
- [ ] 在 `client/` 运行 `npm test -- src/lib/auth-api.test.ts src/store/useAuthStore.test.ts`，新增 API 和字段断言先失败。
- [ ] 实现接口及响应 unknown 校验，缺少验证字段的历史响应规范化为 null，错误保留 code / Retry-After 或可用 retryAfterSeconds；使用 signal 转发取消，写 store 前检查 aborted 与捕获的 authGeneration。保留现有登录 / me / refresh / claim / logout 行为。
- [ ] persist merge 对旧用户缺字段补 null，服务器数据返回 ISO / null；updateCurrentUser 不覆盖不同 id，不更换 Token、guestId 或 claimState。补验证响应先检查当前身份再调用更新。
- [ ] resetPassword 仅在 200 / 合法成功响应之后 clearAuthentication 并 dispatch `booksoul:auth-invalidated`；失败不清认证。新 API 不用旧凭证 logout 作为重置成功的前提。
- [ ] 实现 generation：persist partialize 不保存它，merge 不信任存储中的同名值；refresh 的所有等待者继续共享原 Promise，返回后各自检查 signal / generation，已陈旧则 superseded 且不 restore / invalidate。当前用户已存在但 refresh 响应 id 不同也拒绝提交。
- [ ] apiFetch / apiUpload 在发请求前捕获 generation，401 后及重试前检查，变化时不刷新 / 重试旧身份请求；正常同身份并发 401 仍只刷新一次。取消一个等待者不终止共享 refresh 网络请求。
- [ ] 补旧存储恢复、畸形响应、429 / 503、abort 后不得 signIn、旧用户补验证响应不覆盖新用户、reset 清状态后旧 refresh 成功 / 失败均不得写回或清新用户的测试；运行 `npm test -- src/lib/auth-api.test.ts src/lib/api.test.ts src/store/useAuthStore.test.ts` 至 PASS。

### Task 2：注册验证码与重发交互

**Files:**

- Modify/Test: `client/src/components/auth/AuthPage.tsx`、`client/src/components/auth/AuthPage.test.tsx`
- Create/Test: `client/src/components/auth/VerificationCodeField.tsx`、`client/src/components/auth/VerificationCodeField.test.tsx`

**Interfaces:**

- Produces: `VerificationCodeField` props 为 `{code: string; onCodeChange: (code: string) => void; sending: boolean; resendAfterSeconds: number; onRequestCode: () => void}`，纯受控字段，所有文本 / 按钮可通过 label 定位。
- Consumes: requestRegistrationCode、authenticate 的明确 register overload；现有 `AuthPage({onAuthenticated})` 接口保留。

- [ ] 写交互失败测试：登录无需 OTP；注册收到 receipt 后输入 `000123` 仍原样提交；60 秒内重发禁用；无 verificationId / 错位数不调用 register；成功后调用 onAuthenticated。
  关键用例 `it('keeps leading zeroes and clears proof when the email changes')`：`expect(submittedBody.code).toBe('000123')`；换邮箱后 `expect(registerRequestCount).toBe(0)`，直到新邮箱收到新 receipt。
- [ ] 运行 `npm test -- src/components/auth/AuthPage.test.tsx src/components/auth/VerificationCodeField.test.tsx`，新增交互测试先失败；旧防 autofill 测试保留。
- [ ] 实现注册发码和 6 位 text / inputMode=numeric 字段，不用 number 丢前导零；register 分支独立调用 overload，附带 name / email / password / verificationId / code。
- [ ] deadline 使用 `Date.now() + seconds * 1000`；timer 只刷新显示，时间跳过后可重新发送。禁用状态不代替服务端限流；429 显示服务端错误及可用等待时间。
- [ ] 邮箱变化 / mode 切换 / unmount 时 abort 请求并清 proof；已不可取消的迟到响应按 request generation 丢弃。不得以旧邮箱 receipt 恢复当前 challenge。
- [ ] 补迟到响应、切换 mode、网络失败 / 邮件申请已受理、过期提示和多字节密码边界的测试，运行相关测试至 PASS。主题、输入框解锁与现有登录体验保持一致。

### Task 3：找回申请与旧账号补验证

**Files:**

- Create/Test: `client/src/components/auth/ForgotPasswordForm.tsx`、`client/src/components/auth/ForgotPasswordForm.test.tsx`
- Create/Test: `client/src/components/auth/EmailVerificationForm.tsx`、`client/src/components/auth/EmailVerificationForm.test.tsx`
- Modify: `client/src/components/auth/AccountSection.tsx`
- Create/Test: `client/src/components/auth/AccountSection.test.tsx`
- Modify: `client/src/components/auth/AuthPage.tsx`（登录页“忘记密码”入口）

**Interfaces:**

- Produces: `ForgotPasswordForm({initialEmail: string, onBack: () => void})`。
- Produces: `EmailVerificationForm({userId: string, onClose: () => void})`；不提供邮箱编辑或任意账号目标。
- Consumes: Task 1 的找回 / 补验证 API；Task 2 的 VerificationCodeField。

- [ ] 写失败测试：找回申请显示共同基线统一消息、不展示账号存在性；服务不可用保留错误；null / 缺验证字段用户看见补验证入口但仍能使用账号区；已验证用户显示已验证状态。
  关键用例 `it('allows an unverified legacy account to keep using the account section')`：`expect(container.textContent).toContain('补验证')`；`expect(container.querySelector('[aria-label="退出登录"]')).not.toBeNull()`，补验证不能替换成强制登录门禁。
- [ ] 运行 `npm test -- src/components/auth/ForgotPasswordForm.test.tsx src/components/auth/EmailVerificationForm.test.tsx src/components/auth/AccountSection.test.tsx`，新增功能测试先失败。
- [ ] 登录页增加找回入口，发送后显示“如果该邮箱已注册……”及冷却；不显示已确定发送 / 确定不存在；不自动跳到无 Token 的 reset 页。
- [ ] AccountSection 加非阻塞验证状态及补验证表单；邮箱取当前 user，不接受编辑；复用发码与倒计时，成功后调用更新同一用户的 API 结果。
- [ ] 用户切换或退出使补验证请求取消 / 迟到结果失效；成功不清书架、不重新认领 guest、不改变 userId / accessToken。保持原退出失败提示与认领入口。
- [ ] 补正常 / 错码 / 重发 / 401 / 切换账号测试，运行上述相关测试至 PASS。

### Task 4：重置页、URL 秘密清理与页面优先级

**Files:**

- Create/Test: `client/src/lib/reset-password-route.ts`、`client/src/lib/reset-password-route.test.ts`
- Create/Test: `client/src/components/auth/ResetPasswordPage.tsx`、`client/src/components/auth/ResetPasswordPage.test.tsx`
- Modify/Test: `client/src/lib/app-flow.ts`、`client/src/lib/app-flow.test.ts`
- Modify: `client/src/App.tsx`
- Create/Test: `client/src/App.test.tsx`
- Modify: `client/README.md`（入口及重置后的正常登录行为）

**Interfaces:**

- Produces: `readResetRoute(hash: string): {isResetRoute: boolean; token: string | null}`；识别 `#reset-password?token=...`，非法 / 缺 Token 仍进入解释页面。
- Produces: `ResetPasswordPage({token: string | null, onComplete: () => void, onExit: () => void})`；两次密码输入只在一致后提交。
- Produces: AppFlowState 新增可选 `isResetRoute?: boolean`，AppScreen 加 `'reset-password'`，优先判断 reset 再判 authReady。

- [ ] 写失败测试，固定页面优先级与秘密处理：

```ts
// it('shows the reset page before session restoration and removes its secret URL')
expect(resolveAppScreen({authReady: false, isAuthenticated: true, view: 'library', isResetRoute: true}))
  .toBe('reset-password');
expect(readResetRoute('#reset-password')).toEqual({isResetRoute: true, token: null});
// App 捕获后地址不含 token；Token 不在 localStorage、页面成功文案或日志。
```

- [ ] 运行 `npm test -- src/lib/reset-password-route.test.ts src/lib/app-flow.test.ts src/components/auth/ResetPasswordPage.test.tsx src/App.test.tsx`，新优先级断言先失败。
- [ ] 用纯函数解析及验证 Token 形状；App 在 state 捕获 Token，effect 立即 replaceState 清 fragment（保留 pathname / 非秘密 search）。监听 hashchange 以支持已打开 App 的链接进入；清 URL 不清页面内存。保持 React StrictMode 下可用，不能在渲染中执行 history 副作用。
- [ ] 进入 reset route 时调用 invalidatePendingAuthentication，并 abort App 的恢复等待者；reset route 存在时暂停新的恢复。复用 Task 1 的 generation / superseded，旧 me / refresh 不能重新恢复会话或清掉后续新登录。signal 可取消 me / 本次等待者，不取消其他共享刷新等待者。
- [ ] 提交成功消费内存 Token，进入成功说明及登录页；任务 1 清认证并发失效事件，书架 / memory / chat 原有失效路径应触发。重复提交禁用，Token 已用 / 过期 / 无效显示重新申请入口；GET / render 不调用 reset API。
- [ ] 补已登录打开链接、StrictMode、两次密码不符、多字节超限、401 / 400 / 网络失败、成功后缓存失效及迟到恢复响应测试；回到常规页面后再按原流程恢复会话。
- [ ] 运行本任务相关 Vitest 至 PASS，再运行 `npm run check`。API 兼容联调与 server 质量门交给 Plan 06。

## 验证与完成条件

- [ ] 四条用户路径和本文件 Review Focus 均有交互验证，旧登录 / autofill 断言通过。
- [ ] reset 秘密不持久化，注册邮箱与 proof 不错配，补验证不会改另一用户元数据。
- [ ] 前端缺验证字段不会阻断旧用户；验证码冷却只用于体验。
- [ ] mock 验收完成与真实后端联调分别记录；邮件收件、SMTP 和真实 DB 未验证时准确披露。
