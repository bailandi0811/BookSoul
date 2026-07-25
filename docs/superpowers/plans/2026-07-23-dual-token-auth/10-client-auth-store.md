# CLIENT-01：Guest 身份与认证状态仓库

**目标：** 前端拥有稳定、可恢复且状态一致的 Guest/User 身份管理能力。

**依赖：** 可与后端基础需求并行。

## 范围

- 新增持久化 `useAuthStore`。
- 管理 `user`、`accessToken`、`refreshToken`、`guestUserId`、`isAuthenticated`。
- 首次打开生成 `guest_<uuid>`，页面刷新后保持稳定。
- 提供登录成功、Token 更新、认证失效和安全登出的原子状态方法。
- 兼容旧的 `anonymous`，按索引文档约定升级或保留用于认领。
- 避免出现“有 user 无 Token”或“已登出仍保留账号数据”的非法状态。

## 不包含

- 登录注册界面。
- HTTP 401 自动刷新。
- Guest 数据认领接口调用。

## 状态规则

- Guest：存在 `guestUserId`，无用户和双 Token。
- User：存在用户和双 Token；`guestUserId` 暂时保留到认领完成。
- 认证失效：清理用户和双 Token，并进入新的或约定的 Guest 状态。

## 验收清单

- [ ] 首次打开自动生成合法 Guest ID。
- [ ] 刷新页面后 Guest ID 保持不变。
- [ ] 新浏览器存储环境生成不同 Guest ID。
- [ ] 登录状态可以持久化并正确恢复。
- [ ] Token 更新不会丢失用户和待认领 Guest 信息。
- [ ] 清理认证状态后不保留上一账号的用户数据。
- [ ] `anonymous` 兼容流程有单元测试。

## 测试建议

- Zustand action 与 persist 恢复测试。
- Guest → User → 新 Guest 状态转换测试。
- 损坏或缺字段的 localStorage 数据恢复测试。
