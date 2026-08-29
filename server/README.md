# BookSoul Server

NestJS 11 API，提供账号认证、私人书架、EPUB/TXT 持久化处理、版本化向量检索、按书会话、阅读进度、防剧透、原文引用和隔离记忆。

## 命令

```bash
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
npm run check
```

`npm run check` 依次执行 lint、TypeScript 检查、单元测试和生产构建。`npm run lint` 不修改文件；需要自动修复时显式执行 `npm run lint:fix`。

## 认证与作用域

- 登录和注册返回 `{ accessToken, user }`，同时设置 `booksoul_refresh` HttpOnly Cookie。
- `POST /api/auth/refresh` 与 `POST /api/auth/logout` 从 Cookie 读取刷新令牌。
- 私人书籍接口使用 `Authorization: Bearer <access-token>`。
- owner 始终来自服务端认证上下文；聊天请求只接受 `sessionId`、`message` 与单次 `spoilerOverride`。
- session 在服务端反查 assistant、book、owner、embedding version 与 spoiler ceiling。

## 书籍处理生命周期

上传只保存文件并创建持久任务。worker 依次执行解析、分节、切块、批量 Embedding、Milvus 写入和一致性核对，成功后书籍进入 `READY`。失败会保留稳定错误码并支持重试；进程重启后会回收超时租约。

删除先把书籍置为 `DELETING`，再可靠清理向量、源文件和 PostgreSQL 记录。部分失败不会误报完成，后台会继续重试。

## 配置

复制 `.env.example` 为 `.env`。启动时会拒绝缺失的 `DATABASE_URL`、少于 32 位或仍为示例值的 `JWT_ACCESS_SECRET`，以及非法的数值配置。

生产环境必须：

- 把 `CORS_ORIGINS` 设置为真实前端来源，可用逗号分隔多个来源；
- 使用独立随机的 JWT 密钥；
- 通过密钥管理服务注入数据库、模型和 Milvus 凭据；
- 使用私有、持久化的 `BOOK_UPLOAD_DIR`；
- 不记录密码、Token、Cookie、正文、完整访客标识或私有路径。

## 迁移

`npm run migrate:file-data` 可幂等复制旧 JSON 数据，不删除源文件。

`npm run migrate:private-reader -- ../天龙八部.epub` 可创建稳定的只读系统示例书。正文随后会发送给当前 Embedding 服务并写入当前 Milvus 目标，因此执行前必须确认文件处理权限和外部数据目的地。书籍 READY 后执行 `npm run migrate:private-reader:backfill`，把可识别的注册用户旧会话和小说内容类记忆绑定到各自的系统书助手；账号偏好与用户事实仍保持全局。

## 端到端验收

服务运行且 PostgreSQL、模型与 Milvus 可用时：

```bash
npm run test:e2e:reader
```

脚本覆盖上传、READY、目录、阅读进度、助手设置、引用、防剧透、按书记忆、历史和删除清理，并自动删除临时用户。
