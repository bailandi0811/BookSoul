# MEMORY-01：记忆 CRUD 与搜索归属隔离

**目标：** Memory profile、长期记忆和向量搜索只能操作当前身份的数据。

**依赖：** IDENTITY-01。

## 范围

- Memory profile、列表、搜索、修改和删除接口接入 AuthContext。
- 路径中的 `userId` 删除或强制与 AuthContext 一致。
- body/query 中的 `userId` 不再作为可信身份。
- Repository 层统一通过可信 `userId` 生成目录。
- 文件路径执行规范化和根目录边界校验。
- Milvus 查询和修改强制带当前身份的 `user_id` 条件。

## 不包含

- Guest 记忆迁移。
- 将记忆正文迁入 PostgreSQL。
- 重构记忆打分和抽取算法。

## 兼容策略

若暂时保留包含 `userId` 的旧 URL，服务端必须校验其与 AuthContext 完全一致；前端迁移完成后再删除兼容参数。

## 验收清单

- [ ] Guest 只能读取、搜索、修改和删除自己的记忆。
- [ ] 用户 A 无法访问用户 B 的 profile 和长期记忆。
- [ ] 用户 A 无法通过 URL、query 或 body 伪造用户 B。
- [ ] Milvus 搜索始终附加可信 `user_id` 过滤。
- [ ] `../`、绝对路径和编码后的路径穿越输入被拒绝。
- [ ] 合法记忆读写和检索能力与改造前一致。

## 测试建议

- Memory Controller 的 User / Guest / 越权矩阵测试。
- Repository 的路径边界与目录生成测试。
- Milvus Service 的 `user_id` 过滤参数测试。
