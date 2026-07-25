# AUTH-01：Prisma 与 PostgreSQL 基础设施

**目标：** 为账号和 Refresh Token 提供可迁移、可测试的关系数据库基础。

**依赖：** 无。

## 范围

- 安装并配置 `prisma`、`@prisma/client`。
- 新增 `server/prisma/schema.prisma`。
- 建立 `User` 与 `RefreshToken` 模型、索引和级联关系。
- 新增全局 `PrismaModule` / `PrismaService`。
- 增加 `DATABASE_URL` 配置和首次 migration。
- 提供本地迁移与 Prisma Client 生成命令。

## 不包含

- 注册、登录和 Token 接口。
- 聊天或记忆正文进入 PostgreSQL。

## 实现触点

- `server/package.json`
- `server/prisma/schema.prisma`
- `server/prisma/migrations/`
- `server/src/prisma/prisma.module.ts`
- `server/src/prisma/prisma.service.ts`
- `server/src/app.module.ts`

## 验收清单

- [ ] 空 PostgreSQL 数据库可成功执行全部 migration。
- [ ] NestJS 服务连接数据库后正常启动和关闭。
- [ ] `User.email` 唯一约束生效。
- [ ] `RefreshToken.tokenHash` 唯一约束生效。
- [ ] 删除用户时其 Refresh Token 自动删除。
- [ ] Schema 不包含明文密码或明文 Refresh Token 字段。
- [ ] 数据库连接失败时启动错误清晰且不泄漏凭证。

## 测试建议

- Prisma schema 校验与 Client 生成。
- 在干净测试库执行迁移。
- User / RefreshToken 最小 CRUD 与级联删除集成测试。
