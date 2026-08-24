# BookSoul 双 Token 登录一期：闭环需求索引

> **使用方式：** 本目录将一期需求拆为 14 个可独立开发、测试和验收的小需求。每个文件的验收清单全部通过后，才算该需求完成。

**总目标：** 跑通“访客聊天 → 注册/登录 → 认领访客数据 → Token 刷新 → 安全登出”，同时消除客户端伪造 `userId` 造成的越权风险。

**原始设计：** [2026-07-23-dual-token-auth-design.md](../../specs/2026-07-23-dual-token-auth-design.md)

## 开发前固定约定

1. 新访客统一使用 `guest_<uuid>`；`anonymous` 仅作为兼容旧数据的特殊 Guest ID。
2. 一期 `claim-guest` 只认领当前 `sessionId`，不默认迁移整个 Guest 目录。
3. 当前设备登出使用 Refresh Token 吊销；全部设备登出使用 Access Token 鉴权。
4. Guest ID 使用高熵 UUID，视作临时身份凭证；服务端校验格式、路径和归属，日志不得输出完整值。
5. 前端沿用现有 `fetch` 并建立统一请求封装，不为本期单独引入 axios。
6. 各业务接口只能使用服务端生成的 `AuthContext.userId`，不得信任 body、query 或 path 中任意传入的 `userId`。

## 需求清单

| 顺序 | 编号 | 闭环需求 | 状态 | 依赖 |
|---|---|---|---|---|
| 1 | AUTH-01 | [Prisma 与 PostgreSQL 基础设施](01-auth-prisma-foundation.md) | 已完成 | 无 |
| 2 | AUTH-02 | [注册、登录与当前用户](02-auth-register-login-me.md) | 已完成 | AUTH-01 |
| 3 | AUTH-03 | [Refresh Token 轮换](03-refresh-token-rotation.md) | 已完成 | AUTH-02 |
| 4 | AUTH-04 | [当前设备与全部设备登出](04-auth-logout.md) | 已完成 | AUTH-03 |
| 5 | IDENTITY-01 | [统一用户与 Guest 身份上下文](05-identity-context.md) | 已完成 | AUTH-02 |
| 6 | CHAT-01 | [聊天与历史记录归属隔离](06-chat-history-isolation.md) | 已完成 | IDENTITY-01 |
| 7 | MEMORY-01 | [记忆 CRUD 与搜索归属隔离](07-memory-isolation.md) | 已完成 | IDENTITY-01 |
| 8 | CLAIM-01 | [访客聊天历史认领](08-claim-chat-history.md) | 已完成 | CHAT-01 |
| 9 | CLAIM-02 | [访客记忆与 Milvus 认领](09-claim-memory-milvus.md) | 已完成 | MEMORY-01、CLAIM-01 |
| 10 | CLIENT-01 | [Guest 身份与认证状态仓库](10-client-auth-store.md) | 已完成 | 可并行 |
| 11 | CLIENT-02 | [注册登录界面与账号展示](11-client-auth-ui.md) | 已完成 | AUTH-02、CLIENT-01 |
| 12 | CLIENT-03 | [统一请求与 401 单飞刷新](12-client-http-refresh.md) | 已完成 | AUTH-03、IDENTITY-01、CLIENT-01 |
| 13 | CLIENT-04 | [自动认领与安全登出](13-client-claim-logout.md) | 已完成 | AUTH-04、CLAIM-01、CLAIM-02、CLIENT-02、CLIENT-03 |
| 14 | RELEASE-01 | [一期端到端验收与文档](14-release-acceptance.md) | 已完成 | 其余需求 |

## 推荐实施顺序

```text
AUTH-01 → AUTH-02 → AUTH-03 → AUTH-04
                 ↘ IDENTITY-01 → CHAT-01   → CLAIM-01 ↘
                                → MEMORY-01 → CLAIM-02 → CLIENT-04
CLIENT-01 ─────────────────────→ CLIENT-02 → CLIENT-03 ↗
                                                     → RELEASE-01
```

`CHAT-01` 与 `MEMORY-01` 可并行；`CLIENT-01` 可与后端基础工作并行。Guard 与业务接口身份改造必须在同一个闭环中交付，避免出现“已鉴权但仍信任客户端 `userId`”的安全空窗。

## 通用完成标准

每个需求必须同时满足：

- [ ] 功能代码完成，且范围外内容未混入。
- [ ] 正常路径、失败路径和越权路径均有测试。
- [ ] 构建、类型检查及相关测试通过。
- [ ] API 响应不泄漏密码哈希、完整 Token 或内部路径。
- [ ] 新增配置、迁移或运行方式已更新文档。
- [ ] 可以按文件中的验收步骤独立演示。
