# JWT 邮箱验证与找回密码验收

验收日期：2026-10-03。范围以[设计基线](superpowers/specs/2026-10-02-jwt-email-verification-password-reset-design.md)和[六份计划](superpowers/plans/2026-10-02-jwt-email-verification-password-reset/README.md)为准。本文件记录实际证据；PASS、FAIL、NOT_RUN 分别表示通过、失败、未执行，编写了测试不等于测试通过。

当前结论：**本地验收、隔离 PostgreSQL 用例及用户反馈的验证码 / 登录、找回 / 改密基本流程通过，其余外部用例与发布验收未完成**。最新服务端质量门 61 个 suite / 344 个测试、客户端此前 16 个文件 / 69 个测试全部通过；四条页面路径完成本机浏览器显示与键盘检查。2026-10-03 用户在本机执行专用 DB 命令并回传 4 个 suite / 12 个测试全部通过的输出，数据库结果和证据限制见下表。用户随后确认验证码正常并已登录，对找回 / 改密五步操作反馈“没问题”，具体证据与未覆盖部分见邮件验收表。随后新增的品牌 HTML 邮件已完成离线与浏览器预览检查，实际收件显示尚未验收。不能据此标总体验收完成或可上线。Agent 没有修改实际 `.env`、执行应用数据库迁移、代发真实邮件或部署。

## 验收环境与门禁

- Node 22.19.0、npm 10.9.3，使用现有依赖，没有新增生产依赖。当前 PowerShell 的全局 npm 入口损坏，实际通过 Node 安装目录中的 `npm.cmd` 运行，下文保留可移植的 npm 命令。
- 默认 Jest / Vitest 只使用数据库、邮件与 fetch mock；HTTP 测试使用窄 Nest 模块，不启动 AppModule、worker、Milvus 或模型服务。
- Prisma generate 已成功，仅生成客户端，不执行迁移；它读取现有配置文件，但没有输出配置值或连接数据库。默认质量门不加载实际 `.env`。
- 初次本地验收时，Agent 进程没有显式 `TEST_DATABASE_URL` 和用于比对的 `DATABASE_URL`，没有运行 DB 集成测试。随后用户在自己的终端设置两个 URL 并执行专用验收，结果已回传；该终端的环境变量不自动共享给 Agent，本轮记录结果，不重复连接或运行 DB 测试。
- DB 门禁要求两个 URL 都存在；解析并比较 host、默认端口、database、schema，仅允许独立 `*_test` 数据库及 `test_*` schema。无法证明隔离即在构造客户端前拒绝。竞态套件需要至少两个连接。
- 测试 fixture 只使用本次 UUID、已记录的 ID / 邮箱或既有固定 allowlist 清理；不创建上传文件、不访问向量库，不执行无条件删除、reset、truncate 或 drop。

## 本地验收矩阵

| 用例 | 环境、命令或步骤 | 预期 | 实际观察 | 状态与限制 |
| --- | --- | --- | --- | --- |
| OTP / Reset 摘要及随机形状 | `server`: `npm test -- --runInBand src/auth/auth-challenge.crypto.spec.ts src/auth/auth-challenges.service.spec.ts` | HMAC 绑定邮箱、用途、行与 generation；重发失效、限次、过期、交付状态和一次消费 | 2 个 suite / 11 个测试通过 | PASS；数据库 mock |
| 输入政策与公开用户 | `server`: input policy / users / auth service 相关测试 | bcrypt 字节上限；null / ISO 验证字段；不暴露密码与版本 | 共享输入、公开映射与既有认证回归通过 | PASS；不证明迁移在真实数据上的表现 |
| 注册、补验证、找回及改密服务 | `server`: `npm test -- --runInBand src/auth src/users src/config/env.validation.spec.ts src/tools/tools.service.spec.ts` | 缺 proof 拒绝；只补验证当前用户；统一找回响应；改密推进版本并按 owner 吊销 RT | 当时 15 个 suite / 106 个测试通过 | PASS；SMTP / Prisma mock |
| 旧用户登录、JWT 失效及 IP 限流 | `server`: `npm test -- --runInBand src/auth/auth-lifecycle.spec.ts` | null 用户可登录；重置 POST 不自动登录；旧 me / refresh 401；第 11 次发码 429 | 2 个测试通过，GET reset 不变更状态，Cookie 清除且 RT 不进入 body | PASS；真实 HTTP / Strategy / Throttler，账号事务 mock |
| 认证 API、历史元数据与异步响应 | `client`: `npm test -- src/lib/auth-api.test.ts src/lib/api.test.ts src/store/useAuthStore.test.ts` | 未验证旧元数据兼容；429 保留等待秒数；旧 refresh / login / confirm 不覆盖新身份 | 第一轮 21 个测试通过；之后增加三条刷新拒绝路径并通过 | PASS；fetch mock |
| 四条页面操作路径 | `client`: `npm test -- src/components/auth/auth-flows.integration.test.tsx` | 发码注册保留 `000123`；换邮箱 / 模式清 proof；补验证不换凭证；统一找回文案；重置成功清本地认证；错误可见 | 8 个测试通过，包含 A→B→A、切换模式、错码 / 过期、429 冷却与邮件未配置错误 | PASS；真实组件 / API 封装 / store，fetch mock |
| URL 秘密清理与页面优先级 | `client`: `npm test -- src/App.test.tsx src/lib/reset-password-route.test.ts src/lib/app-flow.test.ts` | reset 优先于恢复 / 书架；StrictMode 可用；Token 不留在地址或存储；GET/render 不提交改密；无效链接退出可重新申请 | 页面优先级、StrictMode、hashchange 与秘密清理通过；有效会话打开无效链接后可以进入登录页 | PASS；DOM 模拟环境 |
| 默认 / 专用 Jest 发现范围 | `server`: `npm test -- --listTests --runInBand`；`npm run test:db -- --listTests` | 默认不发现 DB suite；专用配置实际发现 DB suite | 最新默认发现 61 个 suite、误发现 DB 为 0；此前专用发现 4 个 DB suite | PASS；仅只读发现，不导入或连接 DB |
| DB suite 静态类型检查 | 对三个 auth DB suite 及共享 fixture 单独运行 TypeScript noEmit | fixture、服务接口及 Prisma 类型有效 | 离线检查退出 0 | PASS；此项只证明类型有效，真实 DB 结果见下表 |
| 认证专用验收入口 | `server`: `npm test -- --runInBand src/auth/auth-acceptance.spec.ts`；对入口、helper 和该 spec 单独 TypeScript noEmit / lint；缺少测试 URL 的启动检查 | 先证明隔离、临时密钥、本机前端与受控收件人；拒绝其他收件人 / cc / bcc；认证 API 保持校验与限流 | 16 个测试通过，独立类型 / lint 检查退出 0；缺少测试 URL 的启动按预期退出 1、停在连接前 | PASS；Prisma / Mailer mock，启动拒绝不读取 `.env`，没有证明真实 SMTP 可用 |
| 品牌 HTML 与纯文本邮件 | `server`: `npm test -- --runInBand src/auth/auth-mail.service.spec.ts src/auth/auth-acceptance.spec.ts` | 两种 OTP / Reset / 改密通知均有 HTML 和纯文本；前导零保留；动态内容转义；Logo 作为 CID PNG；真实 MIME 包含 alternative / related 部分 | 2 个 suite / 29 个测试通过；新增断言先观察到 6 处失败，再修复通过；MIME 使用本机 stream transport 生成 | PASS；没有 SMTP、DB 或实际凭据 |
| 邮件本机浏览器预览 | 固定假码 / 假链接，Edge 320×900 / 720×900，禁用网络资源 | Logo 显示、正文 / 验证码可读、长重置链接可换行且与按钮地址一致、无横向溢出 | 注册 / 补验证 / 重置 / 通知共 8 张截图检查，脚本退出 0 | PASS；浏览器预览将 CID 解析为图片数据，不等同 QQ / Gmail / Outlook 实际渲染 |
| 服务端完整质量门 | `server`: `npm run check` | lint、typecheck、全部默认测试、build 全部退出 0 | 61 个 suite / 344 个测试通过，完整命令退出 0 | PASS；默认测试无 DB / SMTP 连接；既有 lint warning 为非阻断项，本轮代码没有新增 warning |
| 客户端完整质量门 | `client`: `npm run check` | lint、全部 Vitest、TypeScript、build 全部退出 0 | 16 个文件 / 69 个测试通过，完整命令退出 0 | PASS；Browserslist 数据过期提示为非阻断警告，未为此更新依赖 |
| 独立代码复核与修复 | 阅读工作区 diff、新文件、共同基线与 Review Focus；针对发现先复现再修复 | 重要问题修复并有回归证据 | 两个重要 UI 问题已修复，四条回归断言曾失败、修复后通过；相关 17 个测试及新增拒绝路径 11 个测试通过 | PASS；未发现已证实的 Critical 问题，不替代真实 DB / SMTP 验收 |
| 本机 Edge 显示、label 与键盘 | 对构建后的页面启动独立临时浏览器配置，只接本机模拟 API；375×812 / 1280×900 | 登录 / 注册 / 找回 / 重置均可显示，无横向溢出；输入框有 label 且 Tab 可达 | 8 张截图已目视检查；各页输入框 Tab 可达；reset fragment 清除，Token 不写 localStorage；脚本退出 0 | PASS；本机桌面浏览器模拟移动视口，没有接真实后端或邮件 |
| 文档与交付检查 | 检查 tracked diff 与新文件、相对链接；`git diff --check` | 无断链、意外生成物、实际环境配置或凭据；改动属于本次认证任务 | 36 个本地文档链接有效，32 个已跟踪改动文件与 58 个新文件已核对；diff 检查退出 0 | PASS；凭据格式扫描与人工范围审查，不替代真实环境日志验收 |

最新服务端完整检查日志为本地 `.superpowers/server-email-html-check.log`；此前日志为 `.superpowers/server-auth-acceptance-check.log`、`.superpowers/server-final-check.log`、`.superpowers/client-final-check.log`。认证页面浏览器验收脚本为 `.superpowers/browser-auth-acceptance.mjs`，截图及结果在 `.superpowers/acceptance-images/`；邮件预览脚本为 `.superpowers/render-auth-email.mjs`，HTML、PNG 及结果在 `.superpowers/auth-email-preview/`。这些验收产物不纳入版本控制。浏览器首次受执行环境限制，后续在获准的本机进程中完成；键盘脚本初次用 input name 识别时漏记无 name 的邮箱框，改为 DOM 位置后通过，没有为该脚本错误修改产品代码。

测试按真实行为合并到服务测试、`auth-flows.integration.test.tsx` 和 `App.test.tsx`，没有为每个组件重复同一条验收。mock 验证只证明结构化契约与状态处理；事务回滚、行锁和 SMTP 收件的结论仅由以下外部验收给出。

复核发现并修复两处行为缺陷：注册邮箱从 A 换到 B 再换回 A、或离开注册再返回时，旧验证码证明可能重新出现；现在每次邮箱 / 模式变化都会取消请求并清空证明。已有会话打开无效重置链接后，返回登录可能直接进入书架而无法重新申请；现在可以明确进入登录页，并保留已有账号状态。此外，显式登录另一个账号会触发私人缓存失效，防止上一个账号的数据残留。对应回归测试均先观察到失败，再修复通过。

## 隔离数据库验收

执行日期：2026-10-03。证据来源为用户在本机 `server/` 目录执行 `& 'E:/Node.js/npm.cmd' run test:db` 后回传的终端输出；Agent 对照当前 suite 的断言核对覆盖范围，没有自行重跑数据库测试。

```text
PASS src/auth/auth-challenges.db.spec.ts
PASS src/auth/auth-reset-race.db.spec.ts
PASS src/auth/auth-lifecycle.db.spec.ts
PASS src/prisma/prisma.service.spec.ts
Test Suites: 4 passed, 4 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        21.678 s
```

此前只读核对的应用目标为 `127.0.0.1:5432 / booksoul / public`；操作指导的测试目标为 `127.0.0.1:5432 / booksoul_test / test_auth`。测试代码在构造 Prisma 客户端前执行隔离门禁，要求两个显式 URL 并拒绝相同应用库。用户回传输出未包含实际连接指纹、PostgreSQL 版本或迁移列表，这些元数据待补充；本记录确认专用用例通过，不声明应用库已升级或真实旧数据已完成迁移。

| 用例 | 专用文件及预期 | 状态、原因 |
| --- | --- | --- |
| 增量字段与唯一约束 | `auth-challenges.db.spec.ts`：最新 schema 中旧形态用户默认 null / 0、同邮箱同用途唯一、秘密摘要唯一、FK cascade | PASS；用户终端结果，fixture 不证明真实旧数据迁移 |
| 配额、消费与错误计数 | 同文件：并发发码最多一次；同 proof 最多一次消费；业务失败回滚；错误次数落库；旧 generation 不能回写 | PASS；真实 PG 用例，不是数据库 mock |
| 双重 reset | `auth-reset-race.db.spec.ts`：同 Token 并发仅一个成功，版本仅加 1 | PASS；两事务使用显式屏障 |
| Refresh → Reset 与 Reset → Refresh | 同文件：明确屏障控制两种顺序，最终无可用旧 RT / JWT | PASS；两种顺序均在本轮 suite 中通过 |
| 验旧密码 → Reset → Login 锁 | 同文件：旧密码快照不能获得新版本凭证 | PASS；本轮 suite 中通过 |
| 失败回滚与业务归属 | `auth-lifecycle.db.spec.ts`：中途失败不部分改密；可正常再重置；Book / session / memory owner 与内容保留；另一用户 RT 有效 | PASS；仅 DB fixture，不涉及源文件、向量和真实用户数据迁移 |
| 既有认证模型约束 | `prisma.service.spec.ts`：邮箱 / RT 摘要唯一、RT 级联删除及字段约束 | PASS；4 个 foundation 测试通过 |

准备时显式提供**实际应用 URL 用于比对**和隔离测试 URL；勿将凭据写入提交内容、截图或验收输出。先核对脱敏指纹（host、port、database、schema）、最新 migration 和连接池。迁移隔离环境也须核对目标，不能默认复用应用库。

授权且隔离目标就绪后执行：

```powershell
cd server
npm run test:db -- --listTests
npm run test:db
```

记录 PG 版本、迁移版本、两种排序各自结果；正常结束关闭连接。隔离条件不满足则停止，不修改 `.env`、放宽门禁或清除业务数据。

## 指定邮箱与浏览器验收

2026-10-03 邮件格式更新后，已有验证码与找回 / 改密的用户反馈继续作为原流程证据；**新版 HTML 排版、内嵌 Logo、按钮及纯文本替代的真实邮箱显示仍为 NOT_RUN**。在原受控验收终端 `Ctrl+C` 停止旧服务，再运行 `& 'E:/Node.js/npm.cmd' run start:auth:acceptance`，保留该终端的隔离 URL、同一轮密钥和受控邮箱设置。冷却后申请新邮件，分别检查手机 / 桌面邮箱中的 Logo、验证码前导零、重置按钮与备用链接。实际邮箱客户端可能调整颜色或屏蔽图片；正文、验证码与链接须在图片不可见时仍可读。

真实邮件使用现有 SMTP 供应商：发送收件邮箱、固定验证码 / 重置链接 / 改密通知文本，不发送小说、会话、记忆或密码。SMTP 供应商的保留策略和收费 / 限额须按当前账号条款核对；应用内队列不持久化，进程中止可丢失待发任务，用户冷却后重发。SMTP 失败使挑战不可用，HTTP 受理不代表收件。

2026-10-03 用户按本机验收指引操作后反馈：“验证码没问题我登录上去了”。记录验证码收件 / 可用及进入登录状态为 PASS，证据来源为用户反馈，Agent 没有重新连接数据库或代发邮件。未记录收件地址、密码、验证码或完整链接；收件箱 / 垃圾邮件分类、SMTP 回执和独立再次登录操作尚未回传。

同日用户对上一轮五步找回 / 改密操作整体反馈“没问题”，并询问上线域名配置。该轮指引包含找回邮件、重置成功、改密通知、新旧密码登录和原窗口重新登录；按用户整体反馈记录基本流程 PASS，没有逐项终端 / 网络输出。打开链接不改密、过期、已使用链接拒绝及部署域名仍无结果，不从这一反馈推导通过。

| 用例 | 实际观察与证据 | 状态与限制 |
| --- | --- | --- |
| 注册页验证码实际收件 / 可用、进入登录状态 | 用户反馈验证码正常且已登录 | PASS；用户手动结果，未区分注册后自动登录与独立再次登录 |
| 重发后旧 proof 失效、错码 / 过期 / 冷却 | 真实邮件流程结果未回传 | NOT_RUN；已有本地回归不替代手动联调 |
| 旧账号登录与补验证 | 真实旧账号的验证状态、ID 和书籍 / 会话 / 记忆保留未回传 | NOT_RUN；已有隔离 DB fixture 和本地回归 |
| 找回邮件、正常链接与重置 | 用户对五步找回 / 改密操作整体反馈“没问题” | PASS；用户手动反馈，本机域名；不证明线上域名配置 |
| 打开链接不改密、过期 / 已用链接拒绝 | 该轮五步指引没有要求这些额外操作，未回传结果 | NOT_RUN；须分别执行，不能从正常重置推导 |
| 新旧密码登录、原窗口需重新登录、改密通知 | 用户对包含这些预期的五步操作整体反馈“没问题” | PASS；基本 UI / 收件流程；旧 me / refresh 的逐项 401 网络证据未回传 |
| SMTP 回执、收件箱 / 垃圾邮件分类 | 已反馈收到验证码，未回传分类或 SMTP 回执 | 收到验证码 PASS；其余 NOT_RUN，不从回执推导送达 |
| 网络失败、完整状态切换、日志与真机移动浏览器 | 尚无这些真实联调结果 | NOT_RUN；本机 Edge 模拟视口 / 键盘检查和 DOM mock 回归已通过 |

### 本机认证服务与收件步骤

为隔离本次账号验收，新增 `server/test/start-auth-acceptance.ts` 入口，仅加载现有 AuthModule / MailModule、Prisma、验证和限流，不启动 AppModule。配置文件只读；应用 URL 在父终端保留用于隔离比较，只有启动子进程改为测试 URL。创建服务前验证两个显式 URL、已确认的本机测试目标、临时认证密钥、本机前端地址和受控收件人。收件许可须为 `AUTH_ACCEPTANCE_SEND_MAIL=yes`，实际发信继续由用户点击发码 / 找回或完成改密触发，启动不主动发送验收邮件。SMTP 适配器只接受指定邮箱，拒绝其他收件人、抄送和密送。

1. 保留之前设置 `DATABASE_URL`、`TEST_DATABASE_URL`、`AUTH_CHALLENGE_SECRET` 和 `AUTH_PUBLIC_BASE_URL` 的 PowerShell 终端，以及本轮密钥。不要把应用 URL 改成测试 URL 再运行门禁；入口会在子进程中完成切换。
2. 在 `server/` 目录，指定自己控制的邮箱并明确允许本轮认证邮件。以下命令由用户在本机执行；Agent 不代发邮件，不记录收件地址、SMTP 凭据或邮件 Token：

   ```powershell
   $env:AUTH_ACCEPTANCE_RECIPIENT = Read-Host '本人控制的测试邮箱，点击发码或找回时会真实发信'
   $env:AUTH_ACCEPTANCE_SEND_MAIL = 'yes'
   & 'E:/Node.js/npm.cmd' run start:auth:acceptance
   ```

3. 看到 `认证验收 API：http://localhost:3000/api/auth` 和测试库指纹后保留该终端。若 3000 已被旧后端占用，在旧后端自己的终端停止它，再启动本入口；不结束无关进程。
4. 新开终端，在 `client/` 目录执行 `npm run dev -- --host localhost --port 5173 --strictPort`，用独立隐私窗口打开 `http://localhost:5173`。它须与 `AUTH_PUBLIC_BASE_URL` 一致；如果使用另一前端端口，两个位置同步修改。独立窗口隔离现有账号的 Cookie 和本地状态。
5. 先在注册页填写同一受控邮箱，点击发送验证码，检查收件箱及垃圾邮件文件夹。服务器受理 202 与实际收件分开记录；未收到时保留 SMTP 失败码并定位，不盲目重复发码。首次收件成功后继续按上述矩阵验收注册、重发、找回、重置、通知及旧凭证拒绝。
6. 这是认证专用 API，书架 / 上传 / 记忆功能不在本次服务中；注册后的书架请求可能显示不可用，不把它误记为注册失败。账号响应与认证页面用于本轮邮箱验收。验收结束 `Ctrl+C` 关闭服务，保留同一轮密钥至链接验收完成；没有回传结果的邮件用例仍为 NOT_RUN。

### 找回密码手动验收

保留当前前后端服务和已登录窗口 A。在另一款浏览器的隐私窗口 B 打开同一前端地址；同一浏览器的多个隐私窗口可能共享 Cookie，不能据此认为登录状态独立。

1. B 的登录页点击“忘记密码”，填写同一受控邮箱并点击“发送重置邮件”。实际收件与页面受理提示分别记录。
2. 把邮件链接复制到 B 打开，不提交密码。先刷新 A，确认仍可恢复原登录；打开链接本身不应改密或吊销凭证。
3. 在 B 设置与旧密码不同的新密码并提交，预期显示“密码已重置，请重新登录。”，同时检查改密通知是否收到。
4. B 返回登录，先用旧密码尝试，预期失败；再用新密码尝试，预期成功。
5. 刷新 A，预期不能恢复旧登录，需要重新登录。若核对网络状态，只记录旧 `me` / `refresh` 的 401，不记录 Authorization、Cookie 或响应中的 Token。
6. 再从邮件复制同一个原始链接到 B，尝试提交符合政策的密码，预期提示链接无效 / 已使用，不能再次改密。已使用链接可以显示表单，拒绝发生在提交阶段；30 分钟过期用例另行等待并记录，不通过修改系统时间或挑战记录模拟真实过期。

仅反馈每项是否符合预期及脱敏错误文字，不回传密码、验证码或完整重置链接。完成上述流程不自动证明补验证、邮件重发、真机移动浏览器或发布验收完成。

## 配置、发布与回退

配置源码已增加 `AUTH_CHALLENGE_SECRET` / `AUTH_PUBLIC_BASE_URL` 映射和校验，`.env.example` 只有空占位；SMTP 配置从 ToolsModule 原样移到共享 MailModule，没有替换供应商。真实配置未改：

2026-10-03 只读检查本机配置字段：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM` 已有非空值，`AUTH_CHALLENGE_SECRET` 与 `AUTH_PUBLIC_BASE_URL` 尚未填写。此检查只确认有无值，不证明 SMTP 可认证或邮件能收件；未输出凭据、修改配置或发送邮件。

- `AUTH_CHALLENGE_SECRET`：独立 32 随机字节的 64 位 hex，不复用 JWT 密钥；部署时生成并通过原有秘密管理方式注入，不输出或记录值。
- `AUTH_PUBLIC_BASE_URL`：受信任客户端地址，生产 HTTPS；开发仅允许本机 HTTP，无凭据 / query / fragment，保留部署子路径。
- 复用现有 `SMTP_*`。缺少认证邮件设置时新邮件功能 503，既有登录 / 刷新不要求邮箱已验证。

### 上线域名配置

后端的 `AUTH_PUBLIC_BASE_URL` 配置为用户实际访问的前端 HTTPS 地址，生成重置链接时使用它。以下只是待审查的配置示例，没有修改真实环境：

```dotenv
NODE_ENV=production
AUTH_PUBLIC_BASE_URL=https://booksoul.example.com
CORS_ORIGINS=https://booksoul.example.com
```

`booksoul.example.com` 替换为正式域名；CORS 来源只包含协议、域名和可选端口，不带路径。当前客户端使用同源 `/api/...` 请求，部署入口须把该路径转发到完整后端；只修改邮件域名不会建立 API 转发。生产模式会给刷新 Cookie 设置 Secure，须通过 HTTPS 访问。部署后重启后端使配置生效，并重新核对新发出的重置邮件、登录、刷新和旧凭证拒绝；已有邮件不会自动换地址。

当前 `start:auth:acceptance` 入口明确限制本机地址、测试库和单个收件人，不用于生产。正式部署构建并启动完整后端（现有 `build` / `start:prod`），使用经审查的生产数据库、迁移和持久认证密钥；不通过移除验收门禁把测试服务改为线上服务。真实配置、迁移和部署执行仍需按仓库约定确认。

发布顺序：确认备份 / 恢复路径与只读基线 → 核对数据库指纹和增量迁移 → 审查真实配置 → 同一窗口部署后端与前端 → 指定账户 smoke → 观察稳定失败码。未执行上述操作，不声称已上线。

停止条件：隔离或配置未证明、验证码未收件、真实竞态失败、旧用户登录失败、前后端注册契约不同步、日志泄密。任一出现都不能标总体验收通过。

回退保留新增列 / 表及用户数据，不删除账号、重置 schema 或恢复旧凭证。**发生过改密后，回退代码必须保留 authVersion 校验和锁保护**；否则暂停回退，单独评审全局 JWT 密钥失效与重新登录方案。已开始的 SSE 不在本期终止范围。
