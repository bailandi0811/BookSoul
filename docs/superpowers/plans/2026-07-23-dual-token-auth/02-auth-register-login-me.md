# AUTH-02：注册、登录与当前用户

**目标：** 用户可以创建账号、登录并通过 Access Token 查询自己的公开资料。

**依赖：** AUTH-01。

## 范围

- 新增 `UsersModule`、`AuthModule`、DTO 和参数校验。
- 启用全局 `ValidationPipe`。
- 实现 `POST /api/auth/register`。
- 实现 `POST /api/auth/login`。
- 实现 `GET /api/auth/me`。
- 邮箱统一去除首尾空格并转为小写。
- 使用 bcrypt cost 10 保存密码哈希。
- 注册成功后直接签发 Access Token 和初始 Refresh Token。
- Access Token payload 固定为 `{ sub, email, type: 'access' }`。

## 不包含

- Refresh Token 轮换。
- 登出和全部设备登出。
- 邮箱验证、找回密码、OAuth。

## 接口约定

成功响应包含 `accessToken`、`refreshToken` 和脱敏后的 `user`。登录失败统一返回“邮箱或密码错误”，避免账号枚举。

## 验收清单

- [ ] 合法邮箱、密码和名称可以完成注册并自动登录。
- [ ] 已存在邮箱无法重复注册。
- [ ] 正确邮箱密码可以登录。
- [ ] 不存在邮箱和错误密码返回同一错误文案与状态码。
- [ ] 有效 Access Token 可调用 `/api/auth/me`。
- [ ] 无 Token、伪造 Token、过期 Token 无法调用 `/api/auth/me`。
- [ ] 响应和日志均不包含 `passwordHash`。
- [ ] Refresh Token 明文只在签发响应中出现，数据库只保存哈希。

## 测试建议

- AuthService：注册、重复邮箱、正确登录、错误登录。
- Controller：DTO 校验和统一响应结构。
- JwtStrategy：合法、过期、错误签名和错误 `type`。
