# 书友客厅交互实施计划

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. 用户已要求直接实施，在当前工作区执行，不创建分支、提交或 PR。

**Goal:** 实现风景纸面左右气泡、账号头像、人类 @、统一通知和可见消息已读。
**Architecture:** 保留同进程 WS 和 REST；增量 @ JSON 与逐消息已读收据，成员保护的上下文和头像读取。独立 community store 持有草稿/目标/可见窗口；UI 负责可见检测和定位，不触碰私人阅读状态。
**Tech Stack:** 现有 React/Zustand/Framer Motion、NestJS/Prisma/PostgreSQL，无新增依赖。
**Spec:** `docs/superpowers/specs/2026-10-05-community-chat-interaction-design.md`

## Global Constraints

- 不改书架、阅读器、私人助手；保留已有未提交改动。
- 不改 .env/部署，不连接实际数据库做测试，不执行迁移。
- 500 缓存、100 消息 DOM、20 待发；@最多10、可见已读每批100、成员查询每页20、上下文最多100。
- 当前用户明确要求实施覆盖技能的重复审批流程；头像仍需最终使用者在产品中主动确认公开说明。

## Review Focus

- 同名成员 @ 必须绑定成员 ID，服务端不可接受客户端昵称。
- 跳到最新不得清空不在视口的旧 @。
- 重连、身份切换和慢请求不可覆盖新窗口或重复角标。
- 头像必须排除退役资产与未确认公开用户，并禁止暴露私有对象路径。
- 长文本、手机、暗色、键盘动作和 reduced-motion 可用。

### Task 1: 服务端通知和定位

Files: `server/prisma/schema.prisma`, 新迁移；`server/src/community/{community.service.ts,community.types.ts,community.projection.ts,community.policy.ts,dto/community.dto.ts,community.controller.ts}` 与相关 spec。
Interfaces: `SendMessageInput.mentionMemberIds?: string[]`；`MessageDTO.mentions`；`CommunitySummary.mentionUnreadCount`；`markVisibleRead(userId, messageIds)`；`messageContext(userId,id)`；`unreadTarget(userId,kind,after?)`。
- [x] 增加拒绝非成员 @、幂等目标变更、收据只写指定房间可见 ID、未读查询排除已读、上下文授权的失败测试，并运行确认 RED。
- [x] 增量 schema/迁移、生成客户端（不执行迁移），实现严格解析和事务授权、消息投影及 endpoints。
- [x] 相关 Jest GREEN；更新数据库专用 fixture 验收，不运行真实 DB。

### Task 2: 公共成员身份和头像

Files: 新 `server/src/community/community-members.service.ts` 和测试；community controller/module、profile module 只导出既有 storage provider；client API 与 avatar 组件。
Interfaces: room-scoped member query `{memberId,name,avatarRevision}`；authenticated `/members/:id/avatar` WebP response；加入 consentVersion2026-10-05。
- [x] 测试 membership、consent、READY/owner/purpose/current avatar 过滤与不泄露 storage URL。
- [x] 复用 ProfileMediaStorage.readBounded 加 timeout/取消，头像返回 no-store，未就绪/无存储明确返回不可用。
- [x] GREEN，不引入外部服务或依赖。

### Task 3: 客户端未读与 @

Files: `client/src/lib/community-{types,api,socket}.ts`、store 和相邻测试。
Interfaces: @ draft targets independent of quote；visible read IDs；jumpToMessage/jumpToUnread(mentionOnly)、target generation；兼容旧响应默认空 @。
- [x] 测试删 @ 不删引用、取消引用不删 @、发送/重试目标保留、打开页面不发送 read、可见消息批量 read、缓存外跳转、身份取消和过期响应。
- [x] 替换新客户端 tail-throughSeq read 为可见 ID read；实时角标和 @ 数量同步，只入口统一计数；成员搜索支持取消。
- [x] 相关 Vitest GREEN。

### Task 4: 独立页面设计与验收

Files: `client/src/components/CommunityChat/`，必要 CommunityChatEntry，文档和 isolated browser fixture。
- [x] 交互测试回复默认 @、候选选择、跳转、隐页不读及头像 fallback。
- [x] 实现风景版单面板，左右气泡/分组/内嵌引用/时间与未读分割；可见检测、目标高亮、跳转提示；有界加载、输入法和低动效。
- [x] 运行两包相关测试、默认 Jest --listTests 确认排除 DB，再两包 check。
- [x] 隔离内存浏览器截图与交互、滚动锚点验收；一次最终独立 review，重要问题 RED→GREEN修复。
- [x] diff/scope 检查，更新验收文档；披露真实 DB/OSS/生产代理未验证。

执行说明：Prisma 新模型 TS/JS 已生成并通过类型检查，但 engine DLL 替换遇到 EPERM，因此完整 generate 未通过；未执行实际迁移。最终证据见 docs/community-chat-acceptance.md。
