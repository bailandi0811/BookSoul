# CLAIM-01：访客聊天历史认领

**目标：** 用户注册或登录后，可以安全、幂等地把当前 Guest 会话归到账号下。

**依赖：** CHAT-01。

## 范围

- 实现受 Access Token 保护的 `POST /api/auth/claim-guest`。
- 请求包含 `guestUserId` 和 `sessionId`。
- Guest Header 与 body 中的 `guestUserId` 必须一致。
- 校验 Guest ID、session ID 和最终文件路径。
- 将目标历史 JSON 的 `userId` 更新为 JWT `sub`。
- 同一用户重复认领同一会话时保持幂等。
- 会话已归属其他用户时返回冲突，不覆盖原归属。

## 不包含

- 默认认领整个 Guest 目录。
- 记忆文件和 Milvus 数据迁移。
- 前端自动调用。

## 安全规则

Guest ID 本身是高熵临时凭证。服务端无法读取浏览器 localStorage，因此以“合法 Guest Header 与 body 一致、目标会话当前归属该 Guest”为最低认领条件。

## 验收清单

- [ ] 登录用户可以认领当前 Guest 会话。
- [ ] 认领后用户历史列表包含该会话。
- [ ] 认领后原 Guest 历史列表不再包含该会话。
- [ ] 同一用户重复认领不会创建重复文件或报错。
- [ ] 无 AT、错误 Guest Header、非法 session ID 的请求失败。
- [ ] 已属于其他用户的会话不能被覆盖。
- [ ] 不存在的会话返回明确结果，不产生空历史文件。

## 测试建议

- 正常认领、重复认领、会话不存在和归属冲突测试。
- Header/body 不一致和路径穿越测试。
- 认领前后 Guest/User 历史列表变化集成测试。
