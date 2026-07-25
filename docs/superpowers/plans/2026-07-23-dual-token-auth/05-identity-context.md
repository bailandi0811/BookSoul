# IDENTITY-01：统一用户与 Guest 身份上下文

**目标：** 为业务接口提供唯一可信的身份来源，禁止客户端任意指定业务 `userId`。

**依赖：** AUTH-02。

## 范围

- 实现 `JwtAuthGuard` 和 `OptionalJwtAuthGuard`。
- 实现 `CurrentUser` / `AuthContext` 装饰器与类型。
- 有合法 Access Token 时，身份取 JWT `sub`。
- 无 Access Token 时，从统一 Guest Header 读取 Guest ID。
- 仅接受 `guest_<uuid>`，并兼容特殊值 `anonymous`。
- 明确无 Token、无效 Token、错误 Token 类型和 Guest 身份的处理差异。
- 提供安全路径拼接和 Guest ID 校验工具。

## 不包含

- 具体 chat、history、memory 接口改造。
- Guest 数据认领。

## 身份优先级

1. 请求携带 Bearer Token 时必须成功校验，不能失败后静默降级为 Guest。
2. 请求未携带 Bearer Token 时，允许业务接口按自身规则进入 Guest。
3. body、query、path 中出现的 `userId` 仅可作为兼容参数，不得覆盖身份上下文。

## 验收清单

- [ ] 有效 AT 能生成 User AuthContext。
- [ ] 无 AT 且 Guest Header 合法时能生成 Guest AuthContext。
- [ ] RT、错误签名或错误 `type` 的 JWT 被拒绝，不降级为 Guest。
- [ ] 非法 UUID、普通用户 UUID、`../`、绝对路径等 Guest ID 被拒绝。
- [ ] 客户端传入其他 `userId` 无法覆盖 AuthContext。
- [ ] 身份解析错误使用统一状态码和错误结构。

## 测试建议

- Guard 参数化测试：无 Token、合法 AT、过期 AT、RT、伪造 JWT。
- Guest 校验测试：合法 UUID、`anonymous`、路径穿越和非法格式。
- 装饰器测试：User 与 Guest 上下文结构一致。
