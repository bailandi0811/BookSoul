# BookSoul 双 Token 登录（一期）需求与设计

**日期：** 2026-07-23  
**状态：** 待用户审阅  
**范围：** 注册 / 登录 / 刷新 / 登出、访客会话迁移、受保护 API；引入 PostgreSQL + Prisma  
**参考：** `D:\ai全栈项目\nestdocs` 双 JWT 流程（在其之上补强 Token 落库、轮换吊销与类型隔离）  
**前置：** 当前身份为硬编码 `anonymous` + 客户端 `sessionId`；无 Auth 模块、无关系库
**实施拆分：** [双 Token 登录一期闭环需求索引](../plans/2026-07-23-dual-token-auth/README.md)

---

## 1. 背景与目标

BookSoul 目前任何人可伪造 `userId` / `sessionId` 读写聊天与记忆；会话列表全局可见。需要正式账号体系，并在**不打断访客体验**的前提下，登录后把当前会话归到账号。

### 本期目标

1. 用户可用邮箱 + 密码注册 / 登录。
2. 采用 **Access Token + Refresh Token** 双令牌；Refresh Token **哈希落库**，支持轮换与服务端吊销。
3. **访客可继续聊天**；登录 / 注册成功后，将当前 `sessionId` 下的聊天历史与记忆目录迁移到真实 `userId`。
4. 受保护的 chat / memory / history API 从「信任 body 里的 userId」改为「以 JWT 中的用户为准」；访客走显式 Guest 通道。
5. 用户与 Refresh Token 存 **PostgreSQL**；聊天正文与记忆仍用现有 **文件系统 JSON + Milvus**。

### 非目标（二期再做）

- OAuth（微信 / GitHub 等）
- 邮箱验证码 / 找回密码完整流（可预留字段与路由，本期不做）
- 把聊天消息 / 记忆正文迁入 PostgreSQL
- RBAC / 多角色管理后台
- httpOnly Cookie 方案（本期仍对齐 nestdocs：前端存 Token，后续可升级）

---

## 2. 已确认决策

| 项 | 选择 |
|----|------|
| 访客策略 | **B** · 访客可继续用；登录后迁移当前会话 / 记忆到账号 |
| 数据库 | **A** · PostgreSQL + Prisma |
| Token 强度 | **C** · RT 哈希落库 + 轮换吊销 + 服务端 logout；AT/RT 区分 `type` |
| 业务数据落点 | **A** · 账号进 PG；chat / memory 仍 FS + Milvus，目录从 `anonymous` 迁到真实 `userId` |
| 凭证 | 邮箱 + 密码（bcrypt）；用户名可选展示名 |
| 前端 Token 存放 | localStorage（Zustand persist），对齐 nestdocs；请求头 `Authorization: Bearer <access>` |
| 登录是否强制 | 否；未登录以 Guest 身份使用，但历史列表仅能看到本机 Guest 会话（见下文） |

---

## 3. 方案对比与推荐

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| 1 · 原样搬 nestdocs | 无状态双 JWT，Token 不落库 | 最快 | 无登出吊销；RT 可当 AT；不安全 |
| 2 · 无状态 + type 补丁 | 加 `type`、服务端 logout 仅清前端 | 比 1 好 | 仍无法吊销已签发 RT |
| **3 · RT 落库 + 轮换（推荐，已选）** | AT 短效 JWT；RT 随机串哈希入库，刷新轮换 | 可吊销、可登出、可踢设备 | 实现量更大，需 PG |

**结论：** 采用方案 3。流程与前端交互参考 nestdocs，安全模型按企业级最小集落地。

---

## 4. 总体架构

```
┌────────────────────┐     POST /api/auth/*      ┌─────────────────────┐
│  Client (React)    │ ◄──────────────────────► │  NestJS AuthModule   │
│  useAuthStore      │   AT(Bearer) / RT(body)  │  JwtAuthGuard        │
│  axios 401 刷新队列 │                          │  UsersModule         │
└─────────┬──────────┘                          └──────────┬──────────┘
          │                                                │
          │ Guest: X-Guest-Session / body.sessionId        │ Prisma
          │ Login: 迁移当前 session → userId               ▼
          │                                      ┌─────────────────────┐
          ▼                                      │  PostgreSQL         │
  FS: chat_histories/                            │  users              │
      memories/{userId}/…                        │  refresh_tokens     │
  Milvus: user_id 过滤                           └─────────────────────┘
```

### 身份模型

| 身份 | `userId` 形态 | 说明 |
|------|---------------|------|
| Guest | 稳定字符串 `guest_<uuid>`（存 localStorage） | 未登录；可聊、可写记忆到该目录 |
| User | PostgreSQL `users.id`（UUID 字符串） | JWT `sub`；API 以此为准，忽略客户端伪造的 userId |

> 说明：现有代码大量使用 `anonymous`。一期迁移策略：新访客生成 `guest_<uuid>`；首次打开时若本地仍是 `anonymous`，可继续沿用该字面量作为 Guest id，或一次性升级为 `guest_<uuid>`（实现时二选一写死，推荐升级并迁移本地目录）。

---

## 5. 数据库设计（PostgreSQL + Prisma）

### 5.1 `User`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `String` (UUID) | PK | JWT `sub`；亦为 FS / Milvus 的 `userId` |
| `email` | `String` | unique, not null | 登录账号 |
| `name` | `String` | not null | 展示名 |
| `passwordHash` | `String` | not null | bcrypt（cost=10） |
| `createdAt` / `updatedAt` | `DateTime` | | |

### 5.2 `RefreshToken`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `String` (UUID) | PK | |
| `userId` | `String` | FK → User, onDelete Cascade | |
| `tokenHash` | `String` | unique, not null | 对明文 RT 做 SHA-256（或 HMAC）后存储 |
| `expiresAt` | `DateTime` | not null | 默认签发后 7 天 |
| `revokedAt` | `DateTime?` | | 登出 / 轮换作废时写入 |
| `replacedById` | `String?` | FK → RefreshToken? | 轮换链（可选，便于审计） |
| `createdAt` | `DateTime` | | |
| `userAgent` / `ip` | `String?` | | 可选元数据，便于「踢设备」 |

**不存 Access Token。** AT 为短效 JWT，丢了等过期即可。

### 5.3 Prisma 位置

- `server/prisma/schema.prisma`
- 环境变量：`DATABASE_URL=postgresql://...`
- 迁移：`prisma migrate` 纳入仓库

---

## 6. Token 设计

### 6.1 Access Token（JWT）

| 项 | 值 |
|----|-----|
| 算法 | HS256 |
| Secret | `JWT_ACCESS_SECRET`（独立） |
| 过期 | `15m` |
| Payload | `{ sub: userId, email, type: 'access' }` |

`JwtStrategy` **只接受** `type === 'access'`。

### 6.2 Refresh Token（不透明串 + DB）

| 项 | 值 |
|----|-----|
| 形态 | 加密安全随机串（如 32+ bytes → base64url），**不是**与 AT 同 payload 的长效 JWT |
| 存储 | 仅存 `tokenHash`；明文只在登录 / 刷新响应里返回一次 |
| 过期 | `7d` |
| 轮换 | 每次 `/auth/refresh`：校验哈希未吊销且未过期 → 签发新 AT + 新 RT → **旧 RT `revokedAt` 置时**，并写 `replacedById` |
| 重用检测（建议一期做） | 若已吊销的 RT 再次被使用 → 吊销该用户该条链上所有未过期 RT（防盗用） |

### 6.3 与 nestdocs 的差异（必读）

| 点 | nestdocs | BookSoul 一期 |
|----|----------|---------------|
| RT 形态 | 7d JWT，同 secret | 不透明串 + DB 哈希 |
| AT/RT 区分 | 无 | `type: 'access'`；RT 不能当 Bearer |
| 登出 | 仅清前端 | `POST /auth/logout` 吊销当前 RT（可选「登出全部设备」） |
| 刷新 | 验 JWT 再签一对 | 查库 + 轮换 |

---

## 7. 后端 API

全局前缀保持现有风格（如 `/api`）。新增 Auth / Users；改造 Chat / Memory。

### 7.1 Auth

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `POST` | `/api/auth/register` | 无 | `{ email, password, name }` → 建用户 + 可选直接发双 Token（推荐注册后即登录） |
| `POST` | `/api/auth/login` | 无 | `{ email, password }` → `{ accessToken, refreshToken, user }` |
| `POST` | `/api/auth/refresh` | 无* | `{ refreshToken }` → 新双 Token |
| `POST` | `/api/auth/logout` | AT 或 RT | `{ refreshToken }` → 吊销该 RT |
| `POST` | `/api/auth/logout-all` | AT | 吊销该用户全部未过期 RT |
| `GET` | `/api/auth/me` | AT | 当前用户资料 |

\* 刷新靠 RT 明文，不走 Access Guard。

**登录 / 注册响应约定：**

```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": { "id": "uuid", "email": "...", "name": "..." }
  }
}
```

密码错误统一文案：`邮箱或密码错误`（防枚举）。

### 7.2 访客迁移

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `POST` | `/api/auth/claim-guest` | AT | Body: `{ guestUserId, sessionId }`；将 FS / Milvus 中该 guest 下指定 session（或整个 guest 目录）归并到当前用户 |

**迁移规则（一期）：**

1. 仅允许迁移「当前客户端声明的」`guestUserId`（与 localStorage 一致），服务端校验路径前缀，禁止 `../` 与跨用户路径。
2. **聊天历史：** `chat_histories/session_{sessionId}.json` 增加 / 更新元数据字段 `userId`；列表 API 按 `userId` 过滤。（若现文件无 `userId`，迁移时写入。）
3. **记忆 / 画像：** 目录 `memories/profiles/{guest}/`、`memories/long_term/{guest}/` 中与 `sessionId` 相关的文件 **move** 到 `{userId}/`；Milvus 对应点的 `user_id` 更新为真实用户（若一期改向量成本高，可文档注明「仅 FS 迁移，向量下次写入自然归属」——**推荐一期尽量更新 Milvus `user_id`，否则检索会漏**）。
4. 迁移成功后前端丢弃 guest id，改用 `user.id`；可选保留 guest 空壳或删除。

### 7.3 现有 API 鉴权改造

| 资源 | 未登录（Guest） | 已登录 |
|------|-----------------|--------|
| `POST /api/chat` | 允许；`userId` 强制为服务端认可的 guest id（来自 header / 受控 body，不可冒充他人 UUID） | `userId` = JWT `sub` |
| `GET /api/chat/history` | 仅返回该 guest 的会话 | 仅返回该 user 的会话 |
| `GET/DELETE .../history/:sessionId` | 校验归属 | 校验归属 |
| Memory CRUD / search | 路径中的 `userId` 必须与身份一致 | 同左 |

实现建议：

- `JwtAuthGuard` + 可选 `OptionalJwtAuthGuard`（有 Token 则解析，无则 Guest）。
- 新增 `CurrentUser` / `AuthContext` 装饰器，**禁止**再信任客户端随意传入的 `userId`。

---

## 8. 前端设计

### 8.1 新增

| 项 | 说明 |
|----|------|
| `useAuthStore` | `user / accessToken / refreshToken / guestUserId / isAuthenticated`，persist |
| 登录 / 注册 UI | 入口：侧栏或入场页「登录」；可用简单 Modal / 独立 view（本期可不引入 react-router，扩展 `view: 'login' \| 'register'` 或浮层） |
| axios 封装 | 对齐 nestdocs：请求附 Bearer；401 单飞刷新队列；刷新失败 → logout → 回访客态或打开登录 |
| `claim-guest` | 登录 / 注册成功后自动调用，再刷新会话列表 |

### 8.2 用户流程

1. 首次打开 → 生成或恢复 `guestUserId` → 可进选角 / 对话。
2. 点击登录 → 提交邮箱密码 → 存双 Token → `claim-guest` → 侧栏显示已登录用户。
3. AT 过期 → 静默 refresh；RT 失效 → 清 Token，保留 guest 能力，提示重新登录。
4. 登出 → 调 `/auth/logout` → 清 Token；可重新生成或保留原 guest 继续聊（**建议登出后回到新的 Guest，避免误显上一账号数据**；上一账号数据仅登录后可见）。

### 8.3 视觉

跟随现有 Claude 风格 tokens（暖象牙 + 珊瑚橙），登录表单保持克制，不做新品牌方向。

---

## 9. 配置与依赖

### 后端新增依赖（预期）

- `@prisma/client` / `prisma`
- `@nestjs/jwt` / `@nestjs/passport` / `passport-jwt`
- `bcrypt`（或 `bcryptjs`）
- 校验：沿用 / 引入 `class-validator` + 全局 `ValidationPipe`（若尚未启用则本期启用）

### 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `JWT_ACCESS_SECRET` | AT 签名密钥 |
| `JWT_ACCESS_EXPIRES` | 默认 `15m` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | 默认 `7` |

---

## 10. 安全要求（一期必须）

1. 密码 bcrypt；响应永不回传 `passwordHash`。
2. AT / RT 职责分离；RT 不可作 API Bearer。
3. RT 仅哈希入库；刷新必轮换；登出必吊销。
4. Guest / User 路径越权防护（历史与记忆）。
5. CORS 可先维持开发态全开，文档标注生产应收紧。
6. 日志禁止打印完整 Token 与密码。

---

## 11. 测试与验收

### 验收标准

- [ ] 注册 / 登录成功返回双 Token；`GET /auth/me` 正常。
- [ ] AT 过期后前端无感刷新；使用旧 RT 再刷新失败（已轮换吊销）。
- [ ] 登出后该 RT 无法再刷新。
- [ ] 未登录可聊天；登录后当前会话出现在用户历史中，且 Guest 侧不再列出（或已迁走）。
- [ ] 用户 A 无法用 API 读写用户 B 的 history / memory。
- [ ] Prisma migrate 可在干净 PG 上跑通。

### 建议测试

- AuthService：登录失败、刷新轮换、重用检测、logout。
- Guard：无 Token / 错误 type / 过期。
- 迁移：guest 目录 move + history 带 `userId` 过滤。
- 前端：401 队列只刷新一次。

---

## 12. 模块与文件规划（实现时）

### 后端（预计）

```
server/prisma/schema.prisma
server/src/prisma/prisma.module.ts
server/src/auth/auth.module.ts
server/src/auth/auth.controller.ts
server/src/auth/auth.service.ts
server/src/auth/jwt.strategy.ts
server/src/auth/guards/*
server/src/auth/dto/*
server/src/users/users.module.ts
server/src/users/users.service.ts
# 改造
server/src/chat/chat.controller.ts
server/src/memory/** 鉴权与 userId 强制
server/src/main.ts  # ValidationPipe
```

### 前端（预计）

```
client/src/store/useAuthStore.ts
client/src/api/http.ts          # axios + 刷新队列
client/src/api/auth.ts
client/src/components/Auth/*    # Login / Register
# 改造 App / Sidebar / useChatStore 接入 auth 与 claim-guest
```

---

## 13. 实施分期建议

| 步骤 | 内容 |
|------|------|
| T1 | Prisma + User / RefreshToken；Auth 注册登录刷新登出 me |
| T2 | Guard 挂到 chat / memory；Guest 身份规则；history 按 userId 过滤 |
| T3 | claim-guest 迁移（FS + Milvus） |
| T4 | 前端 Auth Store、登录 UI、401 刷新、登录后自动 claim |
| T5 | 测试与 readme 环境说明 |

---

## 14. 开放问题（实现前可默认）

| 问题 | 默认（可改） |
|------|----------------|
| 注册后是否直接发 Token | 是（省一步） |
| 登出后 Guest 策略 | 新开 Guest，不自动带回上一账号会话 |
| 旧数据字面量 `anonymous` | 视为特殊 Guest id，支持 claim |
| Milvus `user_id` 批量更新 | 一期做；若环境无 Milvus 则降级只迁 FS 并打日志 |

---

## 15. 成功定义

一期结束后：开发者可用本地 PostgreSQL 跑通完整「访客聊天 → 注册/登录 → 会话仍在 → 刷新 Token → 登出失效」路径；API 不再信任伪造 `userId`；设计与 nestdocs 前端心智一致，安全模型明显强于 nestdocs 无状态实现。
