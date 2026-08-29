# BookSoul 会话与记忆隔离

BookSoul 当前是面向个人账号的产品，因此现阶段的“租户”就是登录用户账号，可信租户键为 JWT `sub`（数据库中的 `User.id`）。客户端提交的 path、query 或 body 中的 `userId` 都不能改变数据归属。

## 三层数据边界

| 数据 | 作用域 | 存储与查询约束 |
| --- | --- | --- |
| 小说原文与章节向量 | 全站共享 | Milvus `ebook` 集合；不附加用户过滤，所有账号读取同一份小说知识库 |
| 对话历史 / 会话短期上下文 | 用户 + 会话 | PostgreSQL `ChatSessionRecord`，复合主键 `(ownerId, sessionId)` |
| 用户画像 / 长期记忆 | 用户 | PostgreSQL 记录必须带 `ownerId`；语义向量使用独立的 `memory_embeddings` 集合，并强制 `user_id == JWT.sub` |

两个账号可以使用相同的 `sessionId`，因为它只在账号内部唯一。历史列表、详情和删除都先使用 JWT 中的 `ownerId` 缩小查询范围；不存在“先按 sessionId 查出记录，再在应用层判断是不是你的”这一类容易泄露存在性的流程。

## 一次聊天的记忆流程

1. `JwtAuthGuard` 校验 Access Token，并把 JWT `sub` 写入 `AuthContext.userId`。
2. Agent 只读取 `(userId, sessionId)` 对应的滚动摘要和最近对话。
3. Agent 从 `memory_embeddings` 按当前 `userId` 召回相关、且已经确认的长期记忆。
4. Agent 可同时从共享 `ebook` 集合检索小说片段；共享小说内容和私人记忆使用不同集合、不同调用链。
5. 回答完成后写入当前用户的会话记录。
6. Memory Gate 只接受明确个人事实、偏好或“请记住”请求；普通长消息和疑似密码、Token、银行卡等敏感内容不会自动保存。
7. 推断出的记忆先作为“待确认”提案；用户明确说“请记住”或在记忆面板确认后，才会进入后续 Agent 召回。
8. 重复内容会累计出现次数并更新已有记录，不再不断新增相同记忆。

## 跨会话行为

- `long_term` 和 `semantic` 记忆属于账号，可在该用户的新会话中召回和展示。
- `episodic` 记忆只属于创建它的会话。
- 用户画像会合并同一账号各会话中已有的偏好与事实，避免换会话后“失忆”。

## 从旧文件存储升级

先部署数据库迁移，再执行一次复制脚本。脚本是幂等的，源 JSON 文件会保留：

```powershell
cd server
npm run prisma:migrate:deploy
npm run migrate:file-data
```

确认数据库数据正常后，再按运维策略归档旧的 `chat_histories/` 与 `memories/`；不要在迁移前删除。

## 真正的组织级多租户

如果以后一个组织下包含多个成员，不能继续把 `userId` 当作组织租户键。届时需要新增 `Tenant` / `Membership`，让业务表同时保存 `tenantId` 和 `ownerId`，JWT 或服务端会话中携带当前租户，并在 PostgreSQL 查询、Milvus 分区或过滤条件、缓存键和审计日志中始终先约束 `tenantId`。
