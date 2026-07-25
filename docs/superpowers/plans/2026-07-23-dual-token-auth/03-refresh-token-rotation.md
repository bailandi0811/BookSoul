# AUTH-03：Refresh Token 轮换

**目标：** Access Token 过期后可以安全刷新，同时阻止旧 Refresh Token 被重复使用。

**依赖：** AUTH-02。

## 范围

- 实现 `POST /api/auth/refresh`。
- Refresh Token 使用至少 32 bytes 的安全随机值并编码为 base64url。
- 数据库仅保存 SHA-256 或 HMAC 哈希。
- 校验 Token 存在、未过期、未吊销且用户有效。
- 每次刷新签发新 AT 和新 RT。
- 在同一数据库事务中吊销旧 RT，并记录 `replacedById`。
- 检测已吊销 RT 重用，并吊销约定轮换链中的仍有效 Token。

## 不包含

- 前端自动刷新队列。
- 当前设备或全部设备登出接口。

## 并发规则

同一个 Refresh Token 被并发提交时，只允许一个请求成功。失败请求不能再次生成有效 Token。

## 验收清单

- [ ] 有效 RT 可以换取新 AT 和新 RT。
- [ ] 刷新后旧 RT 已写入 `revokedAt` 和 `replacedById`。
- [ ] 旧 RT、过期 RT、伪造 RT 均刷新失败。
- [ ] 同一个 RT 并发刷新时仅一个请求成功。
- [ ] 已吊销 RT 被重用时触发轮换链吊销策略。
- [ ] RT 不能作为 Bearer Token 调用 `/auth/me` 或业务接口。
- [ ] 错误响应和日志不包含完整 RT 或哈希值。

## 测试建议

- AuthService：正常轮换、过期、吊销、重用检测。
- 集成测试：两个并发刷新请求竞争同一个 RT。
- Guard：Refresh Token 或错误 `type` 不能当 Access Token 使用。
