# CLIENT-03：统一请求与 401 单飞刷新

**目标：** 所有业务请求自动携带正确身份，并在 Access Token 过期时只刷新一次后重放请求。

**依赖：** AUTH-03、IDENTITY-01、CLIENT-01。

## 范围

- 基于现有 `fetch` 建立统一 HTTP 客户端。
- User 请求自动附加 `Authorization: Bearer <accessToken>`。
- Guest 请求自动附加约定 Guest Header。
- 迁移 chat、history、memory 和 auth API 调用到统一客户端。
- 普通业务请求收到 401 后进入单飞 Refresh 队列。
- 刷新成功后更新双 Token，并将等待请求重放一次。
- 刷新失败后清理账号态、清空账号业务缓存并回到 Guest。
- 登录、注册、刷新接口不得触发递归刷新。

## 不包含

- 自动认领 Guest 数据。
- 登录注册 UI。
- 离线请求队列或跨标签页 Token 同步。

## 重试规则

每个原始请求最多重放一次。业务接口自身返回的 401 与 Refresh 失败都必须结束队列，不能形成无限循环。

## 验收清单

- [ ] User 请求自动携带最新 Access Token。
- [ ] Guest 请求自动携带稳定 Guest ID。
- [ ] 5 个并发 401 只触发 1 次 `/auth/refresh`。
- [ ] 刷新成功后所有等待请求使用新 AT 完成重放。
- [ ] 单个请求最多重放一次，不产生无限循环。
- [ ] Refresh 失败后账号 Token、用户缓存、历史和记忆状态被清理。
- [ ] Refresh 失败后用户仍可继续作为 Guest 使用。
- [ ] 所有现有业务请求不再直接散落调用原生 `fetch`。

## 测试建议

- 单请求刷新、并发单飞、重放失败和 Refresh 失败测试。
- User/Guest 请求头测试。
- 防递归和最多一次重试测试。
