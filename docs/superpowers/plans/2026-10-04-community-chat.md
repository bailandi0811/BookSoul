# BookSoul 公共聊天室实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 按任务实施；只有用户选择委派时才使用 superpowers:subagent-driven-development。下面保留原始执行步骤；实际完成与未验证项见[验收记录](../../community-chat-acceptance.md)。不得自行创建分支、提交、push 或运行真实迁移；WS 依赖与开发代理增量已获用户批准。

**Goal:** 提供一个独立于私人阅读助手的全站书友聊天室，可靠支持纯文本交流、引用、未读、历史、撤回及基本管理。

**Architecture:** NestJS 新建 CommunityModule 和原生 WS Gateway，同进程、同 HTTP 端口；REST 负责加入/票据/历史/已读/撤回/管理，WS 负责发送/提交确认/广播/presence。PostgreSQL 同事务保存公共消息与有序事件，进程通知加数据库补扫负责恢复。客户端用独立 Zustand 状态、`#community` 页面与单实例连接管理，不接入私人 Chat/RAG/Memory。

**Tech Stack:** 现有 React 19、TypeScript、Zustand、NestJS 11、Prisma 6、PostgreSQL、Jest、Vitest、happy-dom；拟新增 server 生产依赖 `@nestjs/websockets`、`@nestjs/platform-ws`、直接声明 `ws`，开发依赖 `@types/ws`；client 使用原生 WebSocket。

**Revision:** 2026-10-04 用户审阅并批准 WS 方案、依赖和开发代理；实现已推进至本地质量门和浏览器夹具验收。真实迁移、管理员初始化、数据库并发和生产代理验收仍未执行。用户要求仅新增聊天页和入口，不重构其他页面。

**Spec:** [公共聊天室设计与验收契约](../specs/2026-10-04-community-chat-design.md)。先读规格再执行本计划；公开边界、数值和事件格式以规格为准。

**UI Preview:** [书友客厅交互 HTML](../../previews/community-chat.html)。用户已要求独立页面，原弹窗方案已同步替换；预览只展示模拟交互，服务端能力仍按任务实施。

## Global Constraints

- 全站一个公共房间 `readers-lobby`；首期纯人与人聊天；`@AI` 不触发模型。
- 必须显式加入；公共 DTO 只返回公共 memberId、昵称快照和默认头像所需信息，不返回账号 ID、邮箱或私有媒体。
- 使用现有 Bearer 鉴权、`apiFetch`、`authGeneration`；所有授权在服务端查询时完成。
- 纯文本 1–2000 Unicode code point；保持现有全局 body parser；每成员 20 次成功新消息/60 秒。
- 每成员最多 3 条 WS，实例总计 100（含握手预约）；心跳/鉴权复查 15 秒、pong 超时 10 秒；连接到 JWT exp，健康连接不轮换。每次发送重新校验 authVersion 与成员。
- 票据最长 30 秒、一次性、Origin 绑定、仅内存；每成员最多 2 张、实例 200 张；URL 不带凭据，协商只返回业务子协议。
- 历史默认 50、最大 100；DOM 100、缓存 500、待发 20；重放每批 100、落后超过 1000 reset。
- WS 单消息 16 KiB、禁用压缩；入站每连接 60 帧/10 秒、串行队列 20 帧；出站最多 100 帧/256 KiB、发送回调最多 5 秒，关闭再等最多 5 秒 terminate；每进程一个事件补扫器，间隔 1 秒。
- 普通请求/握手/resume/提交确认超时均 10 秒；WS 应用帧空闲 45 秒；重连 1/2/4/8/16 秒加最多 20% 抖动，连续失败 5 次停下，稳定 30 秒才清零。
- 不修改 `.env`、生产部署配置、既有迁移；仅经批准注册 WS adapter、开发 `/api` proxy 增加 ws:true；不连接/清理真实应用数据，不把公共消息接入私人记忆和检索。
- 未提交的个人资料/媒体与其他并行改动必须保留；实施仅包含公共模块、新聊天页及必要入口/装配。

## Review Focus

- 提交成功但响应/广播丢失：同一 key 重试只生成一条记录，补扫仍能送达。归任务 2、3、6。
- created 重放发生在撤回之后：不能复活正文或引用 excerpt。归任务 2、3、4。
- 历史翻页与实时消息同时到达、跨缓存淘汰边界：不丢、不重、不跳读。归任务 4、5、7。
- Token 轮换和账号切换同时发生：旧连接、迟到响应和草稿不能覆盖新身份。归任务 3、4。
- 多 tab、连接更换和重启：在线人数按成员去重，配额和幂等不能随连接重置。归任务 2、3、6。

## 执行顺序与文件边界

`任务 0（批准后）→ 任务 1 → 任务 2 → 任务 3 → 任务 4 → 任务 5 → 任务 6 → 任务 7`。任务 6 是真实数据库约束证明，不能用 mock 测试替代；正式上线还需要任务 7 的代理与双浏览器验证。

| 单元 | 文件与职责 |
| --- | --- |
| 契约/策略 | `server/src/community/community.types.ts`、`community.policy.ts`、`dto/community.dto.ts`：内部类型、公共 DTO、边界校验与常量 |
| 公共持久化 | `community.service.ts`：加入、摘要、分页、发送、撤回；`community.moderation.service.ts`：隐藏/禁言；`community.projection.ts`：安全 DTO/引用投影 |
| 实时传输 | `community.events.service.ts`：有序补齐、进程通知、补扫和 presence；`community.gateway.ts`：resume/send 分派；`community.ws-adapter.ts`：upgrade 鉴权与帧边界；`community.connection.ts`：逐连接背压与释放 |
| 认证/装配 | `community.tickets.service.ts`：有界一次性票据；`community-ticket.guard.ts`：现有 JWT 的已验证期限/版本；`community.controller.ts`、`community.module.ts`；`app.module.ts` 导入模块，`main.ts` 注册 adapter |
| 客户端传输/状态 | `client/src/lib/community-api.ts`、`community-socket.ts`；`client/src/store/useCommunityStore.ts`，不改私人 `useChatStore` |
| 客户端界面 | `client/src/components/CommunityChat/{CommunityChatHost,CommunityChatEntry,CommunityChatPage,CommunityMessageList,CommunityMessageItem,CommunityComposer}.tsx`、`useCommunityScroll.ts`；连接宿主放 App、入口放 AppHeader，页面通过 app-flow 切换 |
| 数据/验收 | 新 Prisma 迁移、`.db.spec.ts` 专用配置与 fixture；管理初始化脚本；浏览器验收记录 |

## Task 0：确认后增量安装与兼容性核对

**Files:** Modify `server/package.json`、`server/package-lock.json`；本任务不改代码、配置或数据库。

- [ ] 确认用户已批准规格 3.1 的三个生产包、一个开发包、限定 platform-ws 子依赖 ws=8.21.3 的 override，以及 main.ts / Vite proxy 的具体改动；本轮文档交付不代表批准。
- [ ] 对拟用版本执行只读 `npm view`，核对现有 Nest 锁定版本、peerDependencies 与 Node 22；核对可选 peer 不会引入 Socket.IO。精确版本以规格 3.1 为准，注册表不可用时不得假装已验证。
- [ ] 查看当前 package/lock 用户差异；先加入已批准的限定 override，再用 npm 增量安装 `@nestjs/websockets@11.1.17`、`@nestjs/platform-ws@11.1.17`、`ws@8.21.3`（--save-exact），然后安装 `@types/ws@8.18.2`（--save-dev --save-exact）；不修改无关依赖、不安装可选原生包、不改 registry 配置。
- [ ] 用 `npm ls @nestjs/websockets @nestjs/platform-ws ws` 核对实际树，确保 adapter 未使用有已知漏洞的 8.19.0；检查 audit/安全公告。若还需其他 overrides、框架升级或扩大清单，先报告具体原因并确认，不能静默修改；override 的运行兼容性由任务 3 harness 验证。
- [ ] 运行服务端 typecheck / build，保存结果；审阅 package/lock 增量。**交付：** 经批准且可复现的依赖，不连接数据库。

## Task 1：建立公共数据与输入契约

**Files:**
- Modify：`server/prisma/schema.prisma`（新增四个模型、枚举、必要关系）。
- Create：`server/prisma/migrations/<实施时新时间戳>_community_chat/migration.sql`（唯一命名在实施时生成）。
- Create：`server/src/community/community.types.ts`、`community.policy.ts`、`community.policy.spec.ts`、`dto/community.dto.ts`。

**Interfaces:**
- Produces：规格定义的 `MessageDTO`、`CommunitySummary`、`MessagePage`、`CommunityEventDTO`、`CommunityClientFrame` / `CommunityServerFrame` 判别联合；所有 seq 为 string。
- Produces：`normalizeMessage(content: unknown): string`、`parseSequence(value: unknown): bigint`、`messageRequestHash(content: string, replyToId: string|null): string`，以及规格全部固定策略常量。
- `CommunitySummary` 精确字段：`memberId`、`isModerator`、`mutedUntil: string|null`、`lastReadSeq`、`unreadCount`、`replyUnreadCount`、`latestEventSeq`。
- `MessagePage` 精确字段：`messages: MessageDTO[]`、`hasMore: boolean`、`nextCursor: string|null`、`latestEventSeq: string`。

- [ ] 先写输入回归：`normalizes_trimmed_content`、`counts_unicode_code_points`、`rejects_sequence_overflow`、`rejects_spoofed_scope_fields`、`rejects_unknown_or_malformed_frame`；断言空白拒绝、2000 emoji 接受/2001 拒绝、64 位溢出拒绝、HTTP/WS 额外 owner/role/book 字段拒绝，及 WS 稳定错误码/关闭语义。
- [ ] 在 `server/` 运行 `npm test -- --runInBand community.policy.spec.ts`，先确认失败原因是缺失契约，再实现常量、DTO 与校验，重跑通过。
- [ ] 新增模型和 SQL；两个唯一约束分别覆盖幂等键、房间消息序列；不要引入私人会话外键或级联清空旧数据。
- [ ] 运行 `npm run prisma:generate` 和 `npx prisma validate`；这些命令仅生成/验证 schema，不运行迁移。按实际输出确认通过；任务 6 再证明真实约束。
- [ ] 查看 diff，确认无既有 profile 字段回退、无旧迁移改写。**交付：** 有明确契约与新建表迁移，尚不挂接公开路由。

## Task 2：实现授权、消息、幂等与撤回

**Files:**
- Create：`server/src/community/community.service.ts`、`community.projection.ts` 及各自 `.spec.ts`。

**Interfaces:**
- Consumes：任务 1 的 DTO/常量，`PrismaService`；`userId` 必须由可信 AuthContext 的调用方提供。
- Produces：`join(userId: string, consentVersion: string): Promise<CommunitySummary>`；`summary(userId: string): Promise<CommunitySummary>`。
- Produces：`listMessages(userId: string, query: { before?: string; after?: string; limit?: number }): Promise<MessagePage>`。
- Produces：`send(userId: string, input: { clientMessageId: string; content: string; replyToId?: string }): Promise<MessageDTO>`；`remove(userId: string, messageId: string): Promise<MessageDTO>`；`markRead(userId: string, throughSeq: string): Promise<CommunitySummary>`。
- Produces：`projectMessage(message: CommunityMessageProjection): MessageDTO`；Projection 为显式 Prisma select 对应的内部类型，仅含公共作者快照和当前引用状态，不接收 `PublicUser` 或完整 User。

- [ ] 先写 `requires_membership_before_message_query`、`rejects_cross_room_or_private_reply`、`returns_existing_message_for_same_request`、`rejects_changed_idempotent_request`、`rejects_other_author_removal`、`counts_only_visible_other_authors_as_unread`、`marks_read_monotonically`、`redacts_removed_reference_and_account_fields`。Prisma mock 强制验证 room/member 查询条件；私人 ID 与不存在 ID 都断言 404。
- [ ] 运行 `npm test -- --runInBand community.service.spec.ts community.projection.spec.ts`，确认红，再实现固定房间和事务操作。
- [ ] 房间行锁必须先于成员/消息写；规范化请求 hash 包含 content 和 replyToId；事务内查重成功后不再扣配额、不再创建事件，返回当前安全投影；冲突返回 409。新回复只查询同 room 的 ACTIVE 目标。
- [ ] 写入/配额/事件原子提交。撤回将正文设 null，保留 tombstone 和创建序列；重复撤回不再生成事件；消息/引用查询全部经投影。快照分页在 RepeatableRead 中读取事件水位。
- [ ] 对“已删除原文经旧事件读取”的测试调用同一投影，断言内容及引用 excerpt 为 null；不能依赖前端过滤。
- [ ] 重跑任务测试通过。**交付：** 可独立测试的公共业务服务；并发和约束真实性在任务 6 验证。

## Task 3：接入有界、可重放的实时接口

**Files:**
- Create：`server/src/community/community.events.service.ts`、`community.gateway.ts`、`community.ws-adapter.ts`、`community.connection.ts`、`community.tickets.service.ts`、`community-ticket.guard.ts`、`community.controller.ts`、`community.module.ts` 及相邻 `.spec.ts`。
- Modify：`server/src/app.module.ts` 导入 CommunityModule；`server/src/main.ts` 注册社区 adapter、共享现有 Origin allowlist；不改变 HTTP 的鉴权/CORS 行为和端口。

**Interfaces:**
- Consumes：任务 2 服务；现有 `JwtAuthGuard`、`CurrentAuth`、JwtService/用户认证状态查询，不改现有 JWT 格式。票据 guard 通过现有密钥/算法校验 Bearer 后提取 exp / authVersion，不相信解析未验签的 claims。
- Produces：规格非管理 HTTP 路由与 `/api/community/ws`；`CommunityTicketsService.issue(identity, origin): { ticket, expiresAt, protocol }`、`consume(ticket, origin): Promise<CommunityWsIdentity>`；identity 包含内部 user/member/room、authVersion、JWT expiresAt，仅服务端使用。
- Produces：`CommunityEventsService.subscribe(identity, after: string, signal: AbortSignal): AsyncIterable<CommunityEventDTO>`；Gateway 将其包装成帧，补齐后发 sync.complete。
- Produces：`CommunityConnection.enqueue(frame: CommunityServerFrame): void`、`close(code, reason): void`；统一出站队列、发送回调、字节上限、关闭超时；ack 与广播都通过该出口。
- Produces：`CommunityWsAdapter extends WsAdapter`，只扩展公共路径的鉴权 upgrade、严格帧解析/有界串行分派及生命周期清理；不新增另一套完整 adapter 框架。

- [ ] 先写票据/握手拒绝测试：`requires_membership_before_ticket`、`rejects_missing_exp_or_unverified_claims`、`consumes_ticket_only_once_under_concurrent_upgrade`、`rejects_expired_ticket_or_wrong_origin_before_101`、`does_not_echo_ticket_protocol`、`reserves_and_releases_handshake_capacity`。mock 认证状态、HTTP/socket，不导入 AppModule。
- [ ] 写实时回归：`does_not_lose_event_between_snapshot_and_resume`、`recovers_commit_without_notification`、`replay_projects_current_removed_state`、`rejects_future_event_cursor`、`rejects_send_before_sync_or_duplicate_resume`、`deduplicates_presence_across_tabs`、`ack_is_sent_only_after_commit`、`revoked_identity_cannot_send`、`healthy_connection_does_not_rotate_at_60_seconds`、`releases_slow_or_closed_socket`。
- [ ] 运行 `npm test -- --runInBand community`，默认范围只含无数据库 `.spec.ts`；确认红后实施。使用 fake timers、mock Prisma 与 fake ws 测试策略边界。
- [ ] 票据生成用 node:crypto 随机值，Map 仅保存摘要；同步原子移除再异步校验，校验失败不恢复票据；TTL/数量清理有界。JWT exp 不允许缺失或无效，authVersion 的兼容规则与当前 JwtStrategy 一致；公共票据 guard 不改变其他接口认证契约。
- [ ] 通过 upgrade 阶段接入同端口 noServer WS，合法 Origin/票据/身份/容量全部通过才 101；失败不泄漏异常和凭据。握手等待中预约计入连接上限，断开/超时不执行迟到 handleUpgrade；检查 adapter 自带 upgrade listener 不会先行升级或重复处理。
- [ ] resume 采用“注册监听 → 分批补齐 → 顺序排出 → sync.complete”；一个房间一条串行补扫循环；管理审计仅发 cursor；事件 sequence/order 与 ack 去重语义不混用。
- [ ] 所有帧 unknown 校验，拒绝未知事件、坏 JSON、二进制、额外归属字段；显式处理 WS 错误，不能依赖 HTTP 全局 pipe/限流自动覆盖 WS；不能让官方默认 parser 静默丢弃无效帧。
- [ ] 15 秒 ping/heartbeat/认证复查，10 秒 pong 与同步截止；发送前重新校验身份。实现 JWT 到期定时器、出入站上限、发送回调 5 秒和 close→terminate 5 秒；清理票据/预约/socket/监听/定时器，异常无 unhandled rejection。
- [ ] 在本地临时端口的真实 HTTP+WS harness 使用 mock 业务服务，覆盖 101 前拒绝、子协议、提交 ack、超大帧 1009、心跳、关闭、资源释放；不用真实 Prisma/AppModule、不加载 .env。HTTP 验证 400/401/403/429，WS 验证业务 error、close code 和帧格式。**交付：** 同进程 REST/WS 模块；代理行为在任务 7 验证。

## Task 4：实现客户端传输、身份隔离与一致状态

**Files:**
- Create：`client/src/lib/community-api.ts`、`community-socket.ts` 及 `.test.ts`。
- Modify：`client/vite.config.ts`，仅批准后给现有 `/api` proxy 增加 `ws: true`。
- Create：`client/src/store/useCommunityStore.ts`、`useCommunityStore.test.ts`。

**Interfaces:**
- Consumes：任务 3 HTTP/WS 契约、现有 `apiFetch` 和 `refreshAuthentication`；JSON 及帧先作 unknown 校验，浏览器 WebSocket 交付的是完整消息，不实现 SSE chunk parser。
- Produces：`joinCommunity(signal?)`、`getCommunitySummary(signal?)`、`listCommunityMessages(query, signal?)`、`requestCommunityWsTicket(signal?)`、`removeCommunityMessage(id, signal?)`、`markCommunityRead(seq, signal?)` 的 REST 封装；发送没有第二个 REST 入口。
- Produces：`openCommunitySocket({ after, onFrame, onClose, signal }): Promise<CommunitySocket>`；返回 `sendMessage(input)`、`close()`；连接内部处理票据/子协议、ready→resume→sync.complete、序列应用和超时，不引入第三方 client 包。
- Store 对外状态：`membership`、`isPageActive`、`connectionStatus`、`messages`、`pendingMessages`、`draft`、`replyTarget`、`unreadCount`、`replyUnreadCount`、`lastAppliedEventSeq`、`windowRange`、历史加载/错误状态。
- Store 对外操作：`enterPage()`、`leavePage()`、`join()`、`connect()`、`disconnect()`、`send()`、`retry(clientMessageId)`、`loadOlder()`、`loadNewer()`、`jumpToLatest()`、`markVisibleTailRead()`、`clearForIdentityChange()`。

- [ ] 写 `merges_ack_with_event_in_either_order`、`keeps_client_id_after_lost_ack`、`ack_does_not_advance_event_cursor`、`merges_history_with_live_events`、`clears_all_reference_excerpts_on_removal`、`ignores_old_identity_or_ticket_callbacks`、`ignores_old_connection_callbacks`、`rejects_stale_read_summary`、`refreshes_once_after_expiry`、`stops_after_five_short_failed_connections`、`resets_on_close_even_if_reset_frame_lost`、`caps_cache_and_pending_messages`；覆盖中文完整帧、未知/非法帧、离线按钮与未读条件。
- [ ] 在 `client/` 运行 `npm test -- community-api.test.ts community-socket.test.ts useCommunityStore.test.ts`，确认红后实现。
- [ ] REST/握手/同步/提交确认均有 10 秒截止，健康连接用 45 秒应用帧 watchdog；request abort 同时关闭未完成 WS。401/4001 用既有刷新协调，每次失败链最多一次，不复制 refresh 锁；每次连接申请新票据，不能复用上次已消费票据。
- [ ] 网络/升级失败按规格有界重连；浏览器 onerror 不提供 HTTP 状态，重新申请票据时才能区分 auth/容量失败；403/4003 停止。关闭码不丢失 reset 行为；提交确认超时保留 key，手动重试，不自动重发、不创建第二个 pending。
- [ ] 连接/异步回调捕获 userId、authGeneration 和连接代次，变化即废弃；清除内容和定时器。已读/摘要请求也隔离陈旧响应。消息不持久化；同账号恢复连接先获取权威摘要，避免用不完整本地缓存猜未读数量。
- [ ] 移除事件清除原消息与所有引用；reset 丢弃全部旧引用和消息再取快照。收到自己的 ack/WS created 用 messageId 与 clientMessageId 合并；ack 不跳过待重放事件。
- [ ] 验证两个历史方向，淘汰不覆盖当前窗口；回看缺失记录从 REST 获取；离开页面后不无限追加缓存。**交付：** 可单独测试的状态与传输，不改变私人聊天状态。

## Task 5：实现全局入口与稳定阅读体验

**Files:**
- Create：上述 `client/src/components/CommunityChat/` 六个组件、`useCommunityScroll.ts` 与相邻测试。
- Create：`client/src/components/CommunityChat/community-chat.css`（仅聊天室局部类，使用现有 theme token）。
- Modify：`client/src/App.tsx`、`client/src/components/AppHeader.tsx`、`client/src/lib/app-flow.ts` 及相邻测试，采用当前 profile/外观改动后的版本。

**Interfaces:**
- Consumes：任务 4 store；Host 只管理连接，挂在已登录应用 shell 中且在页面动画容器外，只挂一个实例；Entry 跳转 `#community`，Page 由 App 懒加载。
- Produces：`CommunityChatHost()`、`CommunityChatEntry()`、`CommunityChatPage()`；app-flow 增加 community screen 与 `isCommunityRoute` 判断，保留未登录/密码重置的优先级；组件只调用 public API，不读取私人正文、会话或记忆。
- Produces：`useCommunityScroll({ containerRef, messageIds, atLiveTail, onLoadOlder, onLoadNewer, onReadTail })`；提供首可见消息锚点补偿和贴底状态，不依赖估算行高。

- [ ] 写 `joins_only_after_explicit_consent`、`renders_html_as_text`、`does_not_send_during_ime_composition`、`keeps_read_position_on_incoming_message`、`does_not_mark_read_when_not_at_live_tail`、`mounts_only_one_host_across_page_changes`、`community_route_preserves_auth_priority`、`starter_only_populates_draft`、`restores_confirmation_trigger_focus_on_escape`；happy-dom 测试 stub 几何数据，不能宣称证明真实滚动。
- [ ] 运行 `npm test -- CommunityChat useCommunityScroll`，确认红后实现组件；沿用背景、字体、主题和现有按钮，不复制 Summer 的 Next/shadcn 体系。
- [ ] 首次加入说明和昵称预览按规格；默认头像使用本地元素，不能调用他人 profile API。未加入时不申请票据、不建立 WS、不预读历史；已加入成员由 Host 管理连接。页面导航处理首次进入、刷新、后退和退出登录，不将聊天室路由写入私人 BooksStore；SYNCING 期间禁止发送，未确认显示可手动重试。
- [ ] 实现引用条、sending/failed 重试、自有撤回、99+ 未读、回复提醒、新消息按钮；列表至多 100 个消息节点，真实锚点补偿，纯文本保留换行。
- [ ] 实现独立页面 main/导航语义，加入和撤回确认框的焦点圈定/恢复、Escape、IME、手机可见操作和 reduced-motion；右侧插画/开场在手机让位于聊天，切换页面保留草稿，退出清空。原生 SVG 插画无外部服务，表情仅插入文字，不增加数据模型。
- [ ] 重跑组件测试；在浏览器验收前标记滚动与移动端结果未验证。**交付：** 用户可操作的公共聊天闭环；管理按钮归任务 6。

## Task 6：补齐管理能力并证明数据库不变量

**Files:**
- Create：`server/src/community/community.moderation.service.ts`、`.spec.ts`、`community.db.spec.ts`。
- Modify：`community.controller.ts`、`community.module.ts`、对应控制器测试；`community-api.ts` 和消息/成员管理按钮。
- Create：`server/src/scripts/community-moderator.ts`、`community-moderator.spec.ts`。
- Create：`server/test/jest-community-db.json`、`server/test/support/community-db-fixture.ts`。
- Modify：`server/package.json`，新增 `test:db:community` 与 `community:moderator`，保留任务 0 的已批准依赖，不改无关依赖。

**Interfaces:**
- Produces：`hide(actorUserId: string, messageId: string, reason: string): Promise<MessageDTO>`；`mute(actorUserId: string, targetMemberId: string, input: { clientActionId: string; minutes: 10|60; reason: string }): Promise<{ memberId: string; mutedUntil: string }>`。
- Produces：客户端对应 `hideCommunityMessage`、`muteCommunityMember` 封装；仅管理员显示入口，服务端独立鉴权。
- Produces：`npm run test:db:community` 执行 `jest --config ./test/jest-community-db.json --runInBand`；配置只发现 `community.db.spec.ts`。
- Produces：`npm run community:moderator -- --member-id=<公共成员ID>` 默认预览；`--apply` 才写；脚本只支持精确目标、打印脱敏指纹与将影响 1 行，不显示完整账号资料。

- [ ] 写 `rejects_non_moderator_before_mutation`、`hides_content_in_replay_and_quotes`、`muting_is_not_extended_by_duplicate_request`、`rejects_self_or_moderator_mute`、`moderator_command_is_preview_by_default`；先红后绿。
- [ ] 管理服务采用任务 2 的房间锁顺序与事件事务；禁言前检查权限/目标。`clientActionId` 和规范化参数 hash 保存在审计事件，同一 key 重试返回原到期，改参数 409；重复隐藏不生成新移除事件。
- [ ] 添加真实约束回归：`concurrent_same_key_creates_one_message_and_event`、`commit_order_does_not_skip_late_transaction`、`rate_limit_survives_connection_change`、`private_records_never_enter_public_projection`。用两个事务和 barrier 控制时序，不靠 sleep 碰运气。
- [ ] fixture 复用 `resolveIsolatedDatabaseUrl(process.env)`，不加载 `.env`；新建唯一房间、用户、消息 ID，记录 allowlist。清理按这些 ID 与房间条件限定，先删本次事件/消息/成员再删本次用户/房间，任何空 allowlist 都跳过删除。
- [ ] 写拒绝门禁用例：缺失 TEST_DATABASE_URL、同应用 database、非 `_test`、非 `test_*`、无法解析/歧义目标；在创建 PrismaClient/发出 SQL 前拒绝。
- [ ] 先运行无数据库的相关单测及 `npm test -- --listTests --runInBand`，核对默认发现不含 `.db.spec.ts`；新增测试不得通过 AppModule 启动配置而意外连接实际服务。
- [ ] 仅在用户明确提供并验证隔离目标、允许写入该测试目标后部署新迁移并执行 `npm run test:db:community`。没有隔离环境就记录“未运行”，禁止复用开发库或为验收新建/覆盖 `.env`。
- [ ] 浏览器管理按钮验证普通用户不可见、直接伪造请求仍 403；真实管理初始化须另行确认，不因本计划存在自行执行。**交付：** 首期管理闭环和有证据的数据库约束；未运行项明确记录。

## Task 7：完整质量门与验收交付

**Files:**
- Create：`docs/community-chat-acceptance.md`，记录 C01–C15 的步骤、状态、证据和未运行原因。
- Modify：`client/README.md`、`server/README.md`、`readme.md`、`AGENTS.md`，仅补公共模块入口/边界与专用命令。
- Modify：[私人阅读助手原设计](../specs/2026-08-29-private-reading-assistant-mvp-design.md)，仅增加后续扩展说明并链接本设计，不改写历史 MVP 决策。

**Interfaces:**
- Consumes：任务 1–6 完整产物；规格 C01–C15 是发布清单。
- Produces：验收记录与明确的“可上线 / 有阻塞项”结论；测试通过不能代替部署代理验收。

- [ ] 按最新脚本/测试发现范围/环境加载路径再核对安全门禁。`server/` 先 `npm test -- --listTests --runInBand`，确认没有数据库发现，再运行 `npm run check`；`client/` 运行 `npm run check`。任一步无关失败也记录具体证据，不修无关代码清场。
- [ ] 隔离服务上用 A/B 两个 fixture 账号验收 C02、C06–C09、C12、C14，覆盖断网、重启、引用移除、账号切换、亮暗主题、375×812 和 1440×900。真实浏览器与 fixture 建立方式在执行时据可用工具确定，不预装 Playwright 或新增依赖。
- [ ] 用隔离 fixture 预置 1000 条变长消息，记录消息 DOM/缓存数量及锚点 before/after；记录 20 次正常发送的对端可见延迟，C02 的每次目标 ≤1.5 秒。失败先定位数据库补扫、事件恢复、布局或代理根因，再调整方案，不静默放宽指标。
- [ ] 部署验收核对单实例、WSS/101 Upgrade、Origin 与子协议保留、心跳空闲超时、无票据日志、断开清理与管理员初始化；缺少代理/上线授权只交付本地结果并标为发布阻塞，禁止擅改生产部署配置换取通过。
- [ ] 更新必要首要文档：公共消息是显式公开域，私人阅读数据保持 owner/book/progress 边界；不为公共群聊承诺自动防剧透。
- [ ] 本轮不改上传/索引/引用检索/记忆/删除书籍闭环，因此不默认运行真实 `test:e2e:reader`；若实施扩大到这些范围，按 AGENTS 的真实数据授权和隔离门禁另行处理。
- [ ] 查看最终 `git diff`、`git status --short` 和 `git diff --check`；确认没有用户既有改动被覆盖、私有数据/配置/日志/生成物、无关机械格式化。只报告实际执行的结果。
- [ ] **交付：** 功能及文档完成，逐条列出验收通过/未通过/未运行；真实迁移、外部代理和上线未获授权时保留为清晰的后续步骤，不宣称已部署。

## 工作量与实施入口

按一名熟悉项目的开发者估计：任务 1–2 为 1–1.5 个工作日，任务 3 为 1–1.5 日，任务 4–5 为 1.5–2 日，任务 6–7 为 1.5–2 日，合计约 **5–7 个工作日**。这是方案级估算，依赖隔离测试环境、现有未提交功能稳定程度和代理验收条件，不是已测量结果或工期承诺。

依赖与开发配置已经批准，功能代码与本地检查已实施；发布仍须满足全部 P0 验收。后续先核对隔离测试库与真实迁移目标，再补齐数据库及生产代理证据，不能将内存夹具等同真实服务验收。
