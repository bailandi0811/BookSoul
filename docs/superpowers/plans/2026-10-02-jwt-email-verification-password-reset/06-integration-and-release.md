# Plan 06：集成验收与安全发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 执行方式由用户选择；未经要求不提交或创建分支。

**Goal:** 用跨接口回归和隔离数据库证据证明完整认证闭环，提供可审查的配置、上线和回退清单。

**Architecture:** 默认验收只运行窄模块 / fetch mock，不接外部依赖；专用 DB 套件验证真实事务竞争。真实 SMTP 与实际发布按独立环境、目的地和授权记录执行，不能混入默认 check。

**Tech Stack:** Jest / Supertest、Vitest / happy-dom、Prisma / PostgreSQL 专用测试库、已有 npm 质量门。

**Spec:** [共同设计基线](../../specs/2026-10-02-jwt-email-verification-password-reset-design.md)。

执行记录（2026-10-03）：实现、测试命令、实际结果与未执行项见[验收记录](../../../auth-email-acceptance.md)及[总览状态](README.md)。下方 checkbox 是原验收清单；未逐项完成的外部步骤不勾为通过。

验收追加：用户执行专用 DB 命令后回传全部通过的结果；已对照当前用例核对约束、双排序、登录竞争、回滚与归属断言。证据来源及未回传的 DB 指纹 / 版本 / 迁移元数据统一记录在验收文档。用户随后确认验证码正常并已登录，对五步找回 / 改密基本流程整体反馈“没问题”；具体证据范围与其余未执行用例见验收记录，发布步骤保持未完成。

收件准备追加：新增认证专用本机入口，复用实际认证与邮件服务；启动前核对两个显式数据库 URL、固定测试目标、临时密钥、本机地址、受控邮箱和明确发信许可。16 条离线回归、入口类型 / lint 检查及最新服务端完整质量门通过；实际收件由用户启动后点击触发，验证码 / 登录结果及下一步手动流程见验收记录。

## Global Constraints

- 默认 npm test / npm run check 不连接 DB / SMTP / Milvus，不加载真实 `.env`。
- 专用 DB 命令只允许显式 TEST_DATABASE_URL 的独立 `*_test` / `test_*` 目标，并与应用 URL 完整比对。
- 无无条件 deleteMany、TRUNCATE、DROP、migrate reset；fixture 清理按本次创建 ID / 前缀。
- 新注册后端与前端同一发布窗口；新增 schema 先扩展，不删旧数据。
- 已发生重置后不回退到忽略 authVersion 的鉴权代码，不把 SMTP 接受误当成收件证明。

## Review Focus

- 同一 Token 同时提交：Task 2 真 DB 屏障并发，最多一次改密与版本递增。
- Refresh / Login 两种顺序遇到 Reset：Task 2 验证最终没有旧版本可用凭证。
- 默认质量门误发现 DB 文件：Task 1 发现范围验收，并以专用配置发现真实 DB 套件。
- 迁移把旧账号变已验证或换了 ID：Task 2 / 3 固定旧样本 ID 与验证状态断言。
- 发布回退复活旧 JWT 或邮件中链接错域：Task 3 明确停止条件，发布前核对版本校验与配置地址。

---

## 背景、影响与风险

背景：单元测试可证明摘要、条件与调用，却无法证明 PostgreSQL 锁顺序 / 并发事务效果；真实收信也不能由 MailerService mock 推导。本计划补齐这两类证据及跨端兼容。

影响：新增集成回归与专用 DB spec，更新运维 / 产品入口文档；CI 两包 check 规则不放宽。真实上线不属于默认执行步骤，须按仓库边界核对并授权。

风险：误连用户数据库、fixture 清理越界、随机竞态测试偶然通过、邮件触发真实外部副作用、回退版本漏检查。使用门禁、显式同步屏障和分离验收避免这些风险。

## 前置条件与独立交付

Plan 01–05 功能与相关单测已交付。交付测试文件、实际结果矩阵及运维说明；隔离 DB / SMTP 不可用时默认验收仍能独立运行，但状态只能是“本地验收完成，外部验收待验证”，不能标为可上线。

**Scope：** 本期跨接口回归、隔离 DB 用例、指定邮箱验收与发布说明；不修改 CI 门槛、不测试上传 / 向量链路、不执行未授权的实际配置、迁移或部署。

### Task 1：跨接口与页面回归，不接外部服务

**Files:**

- Create/Test: `server/src/auth/auth-lifecycle.spec.ts`
- Modify/Test: `server/src/auth/auth.controller.spec.ts`、`server/src/auth/protected-features.spec.ts`（补已有 suite 缺口，不复制全部单测）
- Create/Test: `client/src/components/auth/auth-flows.integration.test.tsx`
- Modify/Test: `client/src/lib/api.test.ts`（重置后旧凭证 401 与缓存失效）

**Interfaces:**

- Consumes: Plan 03 / 04 的 HTTP 契约、Plan 05 的公开 UI 与真实 API 封装。
- Produces: 可重复运行的 mock 集成用例；窄 Nest testing module 使用真实 AuthController / DTO / ValidationPipe + 按用例控制的服务 mock，不 import AppModule，不创建真实 Prisma / Mailer transport。
- UI 测试 mock fetch 响应，不 mock 掉被测 auth-api / store 的状态处理；使用现有 react-dom / act。

- [ ] 写失败测试：注册缺 proof 400 / 正确 proof 201 并返回已验证 user；Cookie 不进入 body；旧 null 用户登录 / me 成功；补验证禁止额外 userId；重置前 GET 无 mutation；重置成功不自动登录、清 Cookie / 本地缓存。
  关键用例 `it('keeps reset success separate from a login response')`：`expect(response.status).toBe(200)`；`expect(response.body.data).not.toHaveProperty('accessToken')`；`expect(clientAuth.user).toBeNull()`（服务端与客户端各自 suite 断言）。
- [ ] 明确验证的层次：本任务 HTTP 校验 / envelope / UI 状态；事务与密码学由各服务单测和 Task 2 负责。不要用全量 fake 数据库复制 Prisma 行为。
- [ ] 在 `server/` 运行 `npm test -- --runInBand src/auth/auth-lifecycle.spec.ts`，在 `client/` 运行 `npm test -- src/components/auth/auth-flows.integration.test.tsx src/lib/api.test.ts`，记录首次结果。验收时已有正确实现可以直接通过；发现真实缺陷则先固定失败断言再修复，不制造无意义的红灯。
- [ ] 补两个客户端路径：注册→收据→输入带前导零 OTP→入书架；已登录→打开重置链接→改密→回登录→新密码登录。再补错码 / 过期 / 429 / SMTP 未配置 503 的页面提示，旧登录页面仍可用。
- [ ] 修复只属于此次功能的发现，回到所属 Plan 更新对应断言；不为了通过集成测试更改 mock 文案掩盖真实接口分歧。
- [ ] 运行相关测试至 PASS；用 `npm test -- --listTests --runInBand` 确认默认 server 列表排除 `.db.spec.ts` 与 prisma.service.spec.ts；检查实际脚本和外部加载路径后再运行 server / client 各自 `npm run check`。

### Task 2：隔离 PostgreSQL 的事务和竞态证据

**Files:**

- Create/Test: `server/src/auth/auth-reset-race.db.spec.ts`
- Create/Test: `server/src/auth/auth-lifecycle.db.spec.ts`
- Modify/Test: `server/src/auth/auth-challenges.db.spec.ts`（Plan 01 已建，补必要并发断言）
- Consumes existing: `server/src/prisma/testing/isolated-database.ts`、`server/test/jest-db.json`

**Interfaces:**

- Consumes: `resolveIsolatedDatabaseUrl(env)`；通过校验后为 test Prisma 显式构造 datasource URL，不加载 `.env`，不触发 worker。
- Produces: 事务屏障只在测试夹具 / mock wrapper 中使用；不向生产 endpoint 加测试开关、不依赖 sleep 猜时序。
- Fixture: 本次 UUID / 唯一邮件前缀（`auth-<runId>@example.invalid`），createdUserIds / createdChallengeIds / createdSessionIds 显式记录。

- [ ] 先检查脚本、专用发现列表、环境加载路径和目标指纹。`npm run test:db -- --listTests` 不应出现非 DB 测试。未提供 TEST_DATABASE_URL 或应用 DATABASE_URL 时，在 connect 前拒绝；拒绝日志不含凭据。
- [ ] 若目标未就绪，仅编写 / 静态审查 DB 用例并记录未运行；不能用默认库试跑。隔离目标已有最新 schema 才运行，迁移目标的准备另行核对并授权，不自动 reset / 创建 / 删除 schema。
- [ ] 并发 DB 用例需要至少 2 个数据库连接；目标 URL / 实例无法支持时拒绝该竞态用例并记录原因。屏障均在 finally 释放，使用有上限的 Jest / Prisma 事务超时，不能留下等待任务或真实连接。
- [ ] 写挑战并发测试：60 秒窗口中两个同时 issue 只能一次成功；同 proof 两事务只消费一次；错误计数确实落库；发码旧 generation 迟到不能覆盖新 generation。
- [ ] 写重置并发测试，用可控 Promise 屏障锁定两种排序：

  关键用例 `it('allows exactly one concurrent reset of the same proof')`：`expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)`；`expect(userAfter.authVersion).toBe(userBefore.authVersion + 1)`。

| 顺序 | 必须观察的最终状态 |
| --- | --- |
| Refresh 先拿 User 锁，Reset 后拿 | 刷新的后继随后被 reset 吊销；其 JWT 版本旧，后续 me 401 |
| Reset 先拿锁，Refresh 等待 | Refresh 锁后重新读取 RT，401；没有可用后继 |
| Login 验旧密码后暂停，Reset 提交，再放行 Login | Login 快照复核失败；没有新 RT；旧密码不能获取新版本 JWT |
| 两个 Reset 同 Token 同时提交 | 恰好一个成功、另一个 INVALID_RESET_TOKEN；authVersion 只加 1 |
| Reset 中间故障导致 rollback | 原密码 / version / RT 状态不变，挑战未消费，可再次正常重置 |

- [ ] 写旧用户与归属回归：建 null / 0 用户及纯 DB 的 Book / ChatSessionRecord / MemoryRecord fixture（所有标识用本次前缀、无上传文件 / 向量）；补验证 / 重置前后原 ID、ownerId、书籍和私有记录内容不变；另一用户 RT 不被吊销。
- [ ] 清理只使用 tracked IDs 并按依赖先清 session / memory / challenge，再删除本次 user（其 FK 衍生记录级联）；没有标识则跳过，不允许空 where。绝不访问真实上传目录或向量库。
- [ ] 在隔离门禁通过且相关 DB 写操作获授权后，于 `server/` 运行：`npm run test:db -- --runTestsByPath src/auth/auth-challenges.db.spec.ts src/auth/auth-reset-race.db.spec.ts src/auth/auth-lifecycle.db.spec.ts`。预期所有约束 / 双排序用例 PASS，连接前日志只打印脱敏目标指纹。
- [ ] 用明确屏障各跑两种顺序；已有 PASS 后不无理由重复全套。记录 DB 版本、schema 迁移版本、实际结果和仍未覆盖项，关闭连接。

### Task 3：指定邮箱验收、文档与发布 / 回退清单

**Files:**

- Create: `docs/auth-email-acceptance.md`（环境门禁、验收矩阵、发布 / 回退）
- Create: `server/test/start-auth-acceptance.ts`、`server/test/support/auth-acceptance.ts`（本机认证专用入口和隔离 / 收件门禁）、`server/src/auth/auth-acceptance.spec.ts`（外部服务 mock 回归）
- Modify: `server/package.json`（`start:auth:acceptance` 专用命令，不加入默认质量门）
- Modify: `server/README.md`、`client/README.md`、`readme.md`（各自保持稳定入口，详细表只放验收文档）
- Modify: 本目录 `README.md`（按实际证据更新状态，不能提前标完成）

**Interfaces:**

- Produces: 每条验收记录 `{case, environment, commandOrSteps, expected, observed, status, limitation}`；状态使用 PASS / FAIL / NOT_RUN，不填虚构通过。
- Consumes: 已确认的部署 base URL、独立 auth secret、现有 SMTP provider 配置；只记录配置项名和脱敏目标，不存真实值。

- [x] 准备本机认证专用入口，仅在显式隔离与收件授权校验通过后连接测试库；只允许指定邮箱单独收件；离线测试、类型 / lint 检查通过。入口不加载书籍、记忆、向量库或索引 worker，真实收件另行记录。

- [ ] 先整理可审查的配置差异、需要发出的认证邮件内容 / 类型、指定测试邮箱、SMTP 目的地、可能的供应商限额与数据流；AGENTS.md 要求的真实发信 / 环境修改未确认时保持 NOT_RUN，不先发送再补确认。
- [ ] 获对应授权后，在隔离测试环境逐项验收：注册 OTP、重发后旧码失效、补验证、找回链接地址正确、过期 / 已用链接、新旧密码、改密通知、旧浏览器 me / refresh 401。仅向指定受控邮箱发送，不使用真实用户邮箱做 fixture。
- [ ] 检查页面移动端布局、键盘 label / focus、统一找回文案、网络错误可重试，重置链接 GET 不消费；浏览器地址清除 Token，日志 / 存储无秘密。SMTP 接受、实际收件、垃圾邮件分类分别记录，不一概标通过。
- [ ] 编写发布顺序：备份 / 只读基线与脱敏目标确认 → 只做扩展迁移 → 配置审查与验证 → 同一窗口部署后端及前端 → 受控账户 smoke → 监测失败码。迁移 / 生产部署不是本计划默认授权操作。
- [ ] 编写停止条件：隔离 / 配置未证明、验证码未收到、竞态失败、旧账号不能登录、后端 / 前端契约不同步、日志泄密，均不能发布。
- [ ] 编写回退：保留新增列 / 表及用户数据；如发生过重置，回退代码必须保留 authVersion 校验 / 锁保护，否则停止回退，评审全局密钥失效与重新登录方案。禁止为了回退删除账号、重置 schema 或恢复已失效 Token。
- [ ] 链接六份计划 / 基线和实际验收记录，检查 diff，更新状态只反映有证据的范围；若外部项目 NOT_RUN，保留“未完成发布验收”，不要勾选总验收完成。

## 验证与完成条件

- [x] 两包默认质量门 PASS 且无真实外部连接；默认发现名单与专用 DB 名单正确。
- [x] 数据库约束、重置 / Refresh / Login 竞态有真实隔离 PG 的结果；缺环境时明确 NOT_RUN。
- [ ] 四条真实邮箱路径与受信任链接完成指定邮箱验收；未授权时明确 NOT_RUN。
- [x] 操作说明足以核对配置、目标、升级及安全回退；未执行生产部署不声称已上线。
- [ ] 只有以上必要验收完成，才能把本计划标“总体验收完成”；文档已写与功能可上线分别记录。
