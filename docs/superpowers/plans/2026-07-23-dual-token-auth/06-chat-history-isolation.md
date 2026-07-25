# CHAT-01：聊天与历史记录归属隔离

**目标：** Guest 和登录用户都能正常聊天，但只能访问属于自己的聊天与历史记录。

**依赖：** IDENTITY-01。

## 范围

- `POST /api/chat` 接入 Optional AuthContext。
- 忽略或移除 body 中的 `userId`，统一使用 `AuthContext.userId`。
- 新写入的历史 JSON 必须包含 `userId` 元数据。
- 历史列表按当前身份过滤。
- 历史详情和删除在读取文件前校验归属。
- 没有 `userId` 的旧记录默认不可见，只能通过认领流程补充归属。
- 保持现有 SSE、角色切换和中断能力不变。

## 不包含

- Guest 历史认领。
- 记忆接口改造。
- 将历史正文迁入 PostgreSQL。

## 实现触点

- `server/src/chat/chat.controller.ts`
- `server/src/agent/agent.service.ts`
- `server/chat_histories/`

## 验收清单

- [ ] Guest 可以发送消息并恢复自己的历史。
- [ ] 登录用户可以发送消息并恢复自己的历史。
- [ ] body 中伪造 `userId` 不影响实际数据归属。
- [ ] Guest A 看不到 Guest B 的历史。
- [ ] 用户 A 看不到用户 B 的历史。
- [ ] 用户 A 无法读取或删除用户 B 的指定 session。
- [ ] 未带 `userId` 的旧历史不会继续出现在全局列表。
- [ ] SSE 流式响应行为与改造前一致。

## 测试建议

- 历史列表、详情、删除的 User / Guest 归属矩阵测试。
- 伪造 body `userId` 测试。
- 旧文件缺少 `userId` 时的兼容测试。
