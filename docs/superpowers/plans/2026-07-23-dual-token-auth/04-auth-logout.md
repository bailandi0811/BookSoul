# AUTH-04：当前设备与全部设备登出

**目标：** 用户可以主动使当前设备或全部设备的 Refresh Token 在服务端失效。

**依赖：** AUTH-03。

## 范围

- 实现 `POST /api/auth/logout`，按请求中的 RT 吊销当前会话。
- 实现 `POST /api/auth/logout-all`，按 Access Token 用户吊销全部有效 RT。
- 登出操作支持重复调用，避免客户端重试造成 500。
- 保留短效 Access Token 自然过期，不建立 AT 黑名单。

## 不包含

- 前端登出交互和 Guest 状态重建。
- 管理后台踢指定设备。

## 验收清单

- [ ] 当前设备登出后，该 RT 无法继续刷新。
- [ ] 当前设备登出不影响同一用户的其他有效 RT。
- [ ] 全部设备登出后，该用户所有 RT 均无法刷新。
- [ ] 再次登出已吊销 RT 时接口保持幂等。
- [ ] 用户 A 不能通过 `logout-all` 吊销用户 B 的 Token。
- [ ] 服务端日志不打印完整 Access Token 或 Refresh Token。

## 测试建议

- 当前设备与多设备场景集成测试。
- 已吊销、伪造、过期 RT 的登出行为测试。
- `logout-all` 无 AT、错误 AT 和合法 AT 测试。
