# BookSoul 单机 Docker 部署方案

日期：2026-10-07。状态：用户已确认设计与计划，已完成部署文件和停机代码准备；实际运行验证见 [验收记录](../../deployment/docker-acceptance.md)。没有连接真实数据服务或执行发布。

## 1. 任务契约

- Goal：让首次上线、后续更新和应用版本回退可重复执行，同时保留现有本地开发流程。
- Done：同一发布版本能在 Linux 上构建、启动，通过 HTTPS 功能验收；替换容器后业务数据保留；旧应用版本回退演练通过。
- Scope：前端与后端镜像、单机 Compose、HTTPS/代理、持久化挂载、手动发布流程和验收记录。
- Constraints：保留 npm、现有锁文件和业务架构；不修改本地 `.env`、不搬动或清理现有数据，不自动迁移数据库，不创建分支或提交。
- Risks：单实例发布有短暂中断；后端重启丢失塔罗内存状态；数据库迁移不能通过换镜像撤销；部署环境与外部服务尚未确定。

## 2. 方案选择与假设

推荐：容器化应用，连接已确认的生产数据服务。改动小，发布与数据迁移分离。

备选：应用、PostgreSQL、Redis、Milvus 全部由 Compose 管理。适合明确需要自建的新环境，但增加存储、备份、资源规划和数据迁移工作，首期不选。

另一备选：托管容器平台。可减少部分主机维护，但需重新适配存储、费用和平台配置，当前没有这方面需求。

默认目标是 Linux 单机、一个 API 实例，同进程运行 ingestion worker。现有单实例支持 `AGENT_ADMISSION_MODE=local`；若部署目标已采用 Redis，则保持 Redis 模式并验证连通性，不静默降级。不因为容器化而新增 Redis 或改变已确认的准入方式。

“沿用数据服务”不代表公网服务器能访问 Windows 本机的 localhost。首次实施前必须确认生产 PostgreSQL、Milvus/Zilliz 的实际可达目标；若只存在本机数据，另行设计迁移，不能自动搬库或暴露本机数据库。

## 3. 运行结构

```text
浏览器 --HTTPS--> web：Nginx + 前端静态文件
                    └-- /api 原路径 --> api：NestJS + worker
                                          ├-- PostgreSQL
                                          ├-- Milvus / Zilliz
                                          ├-- Redis（按已选准入模式）
                                          ├-- 独立上传目录
                                          └-- 已配置的模型、SMTP、OSS、MCP 等服务
```

- web 对公网开放 80/443，80 转 HTTPS；TLS 证书从运行环境只读挂载，续期后校验并 reload Nginx。证书签发方式在域名和服务器确定后固定。
- api 仅暴露 Docker 内网 3000，不公开数据库、Redis、向量库端口。
- 本地 `npm run dev`、`npm run start:dev` 和 Vite 代理保持原样。
- 首期不做多副本、worker 拆分、自动发布或零停机承诺。

## 4. 文件与镜像设计

实施时预计新增：

| 文件 | 职责 |
| --- | --- |
| 根 `.dockerignore` | 排除凭据、私人文件、运行时数据、node_modules、dist、日志、Git 和工具状态 |
| `client/Dockerfile` | 构建前端，最终镜像仅保留静态文件和 Nginx 配置 |
| `server/Dockerfile` | 构建后端，提供 runtime 和独立 migration 构建目标 |
| `deploy/compose.yaml` | web/api 的网络、配置注入、健康检查、重启、上传挂载和迁移 profile |
| `deploy/nginx.conf` | HTTPS、静态资源、API、SSE 与 WebSocket 代理 |
| `deploy/release.env.example` | 镜像版本及挂载配置示例，不包含真实凭据 |
| `docs/deployment/docker.md` | 部署、更新、回退、备份和故障检查的正式操作入口 |
| `docs/deployment/docker-acceptance.md` | 实际运行版本、检查结果、未验证项 |

必要源码修改包括入口信号与代理边界、根模块停止接收新业务请求的门禁、WebSocket 停机拒绝路径，以及 Prisma/Redis/MCP 在 HTTP 关闭后清理连接。实现时的回归测试证实仅启用入口 hooks 不足以保证资源关闭顺序，因此补充这些最小生命周期改动。根 README 只增加部署文档入口，不复制长步骤。

镜像采用多阶段构建。后端 Node 22 / npm 10 与当前 CI 对齐，基础镜像使用明确版本并固定 digest；先采用 Debian 系列，以减少 Prisma/OpenSSL 和 sharp 原生依赖兼容问题。最终版本在实施时核对，不使用浮动 latest。[Docker 构建最佳实践](https://docs.docker.com/build/building/best-practices/)

- 从仓库根目录作为 build context，但精确 COPY 所需路径，禁止 COPY 全仓库后再删敏感文件。
- 在 Linux 构建阶段运行 `npm ci`、`prisma generate` 和构建，不复制 Windows node_modules 或 dist。
- Prisma 生成无需连接数据库；如命令要求 URL，仅传无真实凭据、不可用于实际连接的构建占位值，不传本机 `.env`。
- runtime 保留生产依赖、编译输出与 Prisma 引擎；使用非 root 用户和直接 Node 启动，验证 sharp 与 Prisma 在最终镜像可加载。
- migration 目标额外保留锁文件内的 Prisma CLI、schema 和迁移；不依赖 `npx` 临时联网安装，也不启动 AppModule/worker。
- 前端牌图、背景及其他公开静态资产必须完整进入镜像；共享生成数据从当前源确认，不在发布时无条件重写生成文件。
- 镜像使用同一发布编号，例如 release-001；保存两个镜像的 digest、源码版本和质量门结果。当前工作区有大量未提交改动，不能仅凭 Git commit 声称构建内容已固定，应在正式打包前确认发布范围。
- 首期可使用私有镜像仓库；未选仓库时可用 `docker save/load` 传递镜像，仍记录 digest。推送外部仓库须明确授权，镜像不得包含私人数据。

## 5. 配置、持久化和代理约束

- 生产配置放在服务器受限文件中，通过 Compose env_file 注入；不改本地 `.env`，不进入镜像或版本控制。TLS 证书单独挂载。不要在公开日志中输出完整 Compose 展开配置或容器环境。
- 必须配置 `NODE_ENV=production`、受信任的 `CORS_ORIGINS`、独立密钥、可达数据服务和绝对 `BOOK_UPLOAD_DIR`。启用邮件时确认 `AUTH_PUBLIC_BASE_URL` 是 HTTPS 正式地址。
- 容器内部的 localhost 是容器自身；部署时逐个核对连接地址，不能原样复制本机连接配置。
- 上传目录使用独立宿主机目录挂载到容器绝对路径，并提前验证非 root 用户可读写；Nginx 不提供该目录。目录不存在或权限不正确应在预检中失败，不自动采用另一目录。
- 数据库、源文件和向量服务分别制定备份/恢复路径。备份向量版本和模型信息，重建向量属于另行授权操作，可能产生 Embedding 费用。
- 更新不清理卷或上传目录；不使用 `down -v`、带卷的 prune、reset 或自动数据重置。
- Nginx 转发完整 `/api` 前缀。SSE 关闭缓冲及该路径响应压缩，读取超时覆盖应用最长合法运行间隔；WebSocket 转发 Upgrade/Connection，保留并验证 Origin。[Nginx 代理文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- 默认上传原文上限为 50 MiB；代理请求体上限先设 64 MiB 以容纳 multipart 开销，服务端仍执行自身上限。部署若改变上传限额须同步核对代理。
- 验证 Cookie 的 Secure、HttpOnly、SameSite 和 `/api/auth` Path；不能只用 HTTP 演练生产登录刷新。
- 反向代理下验证来源 IP 限流不会把全部用户计为一个来源；若需要 trust proxy，只信任实际代理跳数/网络，不全局无条件信任伪造转发头。

## 6. 健康与停机

当前 `GET /` 只返回运行文本，不证明外部服务健康。首期将其用作轻量进程探针，配置适当间隔避免触发全局限流；依赖 readiness 由发布时额外只读检查与业务验收证明，不将此探针称为完整就绪检查。

web 可以等待 api 健康再启动，但 Compose healthcheck 不会自动修复外部服务，也不会因 unhealthy 自动重启。进程退出才由 `restart: unless-stopped` 恢复。[Compose 启动顺序说明](https://docs.docker.com/compose/how-tos/startup-order/)

后端使用 init 转发信号，启用并验证 NestJS shutdown hooks。停机需要关闭新接入、停止 worker 领取新任务、释放或取消活动资源，并避免数据库先断开而 worker 尚未完成。停机宽限暂设 120 秒；必须验证超时强制终止后持久任务可以按现有 stale 规则恢复，不承诺所有任务在宽限内完成。若现有取消/关闭顺序无法满足要求，列为发布阻塞项并另行审阅最小修复。

单实例发布前选择低峰窗口并等待当前任务尽可能结束。聊天和聊天室连接会中断，塔罗内存状态会丢失；已持久化的账号、阅读进度、历史和书籍应保留。

## 7. 分阶段执行与验收

| 阶段 | 交付物 | 通过条件 |
| --- | --- | --- |
| A：部署目标确认 | OS/架构、域名、数据目标、TLS、备份和镜像传递方式清单 | 所有依赖可达；不使用本机真实数据做演练 |
| B：构建与静态检查 | 两个镜像、Compose 与代理配置 | Linux 构建成功；镜像无秘密/原文；Prisma/sharp 可加载；Compose 与 Nginx 配置检查通过 |
| C：隔离环境演练 | 独立测试数据库、向量集合、上传目录与合成 fixture | HTTPS 登录刷新、上传 READY、阅读、SSE、WS 和取消正常 |
| D：更新与回退演练 | 两个发布版本和验收记录 | 重建后数据一致；旧版应用回退可用；异常停机恢复无重复副作用 |
| E：首次生产上线 | 已核对的配置、备份和发布记录 | 明确授权后发布；生产执行只读验收，发现异常停止并按预案处理 |

隔离环境中的数据库须显式提供 `TEST_DATABASE_URL`，为独立 `*_test` 数据库和 `test_*` schema，并与当前 DATABASE_URL 完整比较 host/port/database/schema。向量集合、上传目录也须各自证明隔离。未证明时停止有写入的验收。

当前 `test:e2e:reader` 使用 Prisma、固定本机 API 地址并写入/清理数据，不能直接充当通用容器验收命令。先审查整个脚本与清理条件，再决定是否增加受控目标参数或使用专用验收入口。默认质量门先审查测试发现范围和环境加载；不得让测试使用生产配置。

需要真实模型/Embedding 的验收只发送合成小说，并在用户允许外部数据流与费用后执行。离线夹具通过不能代替真实供应商验收。

关键验收清单：

- HTTPS 登录后刷新页面和 access token 续期成功；未认证和错误 Origin 请求被拒绝。
- 一个受限账户无法读取另一账户的书籍、引用与历史；章节引用不越过讨论范围。
- 流式回复逐段出现，停止/断开后活动调用与并发租约释放；聊天室连接在代理超时窗口内保持正常。
- 上传限额内文件进入 READY；超限被拒绝；重建容器前后同一本合成书的 ID、正文、位置、历史和源文件校验值一致。
- 测试任务运行中停止容器，重启后按有界恢复规则完成或显式失败，不重复标记成功或清理无关数据。
- 镜像更换后代理解析新的 api 地址，前端旧标签页与缓存行为正常；index 不长期缓存，带 hash 资源按版本缓存。
- 切回旧镜像仍可登录、阅读和提问。带不兼容迁移的发布不得套用这个回退结果。
- 在独立恢复目标演练备份可用；禁止恢复覆盖现有数据库或向量目标。

## 8. 发布与回退操作模型

以下是实施后需落地的流程，当前还没有对应 Compose 文件，不能直接执行：

1. 核对发布范围，运行数据库无关的相关测试与两个包质量门；保存结果。
2. 构建并验收版本 R 的 web/api 镜像，将相同 digest 传到服务器，不在服务器重新构建另一个未经验证的版本。
3. 记录当前版本 P、备份状态、数据服务目标指纹、上传挂载与待应用迁移；检查磁盘空间和依赖连通性。
4. 无 schema 变更：仅更新镜像版本并执行 Compose up；不迁移、不重建数据服务。
5. 有 schema 变更：核对新镜像包含的全部待应用迁移，另行确认后用 migration profile 一次性执行 `prisma migrate deploy`；失败停止发布。不自动在 api entrypoint 跑迁移。
6. 核对实际运行镜像和轻量探针，再通过域名做生产只读检查：认证恢复、已有书库与阅读；未获授权不新建/删除真实数据或发起模型调用。
7. 无不兼容迁移且新版异常：将 web/api 切回 P 并重新验收；不恢复旧数据库、不覆盖上传目录。
8. 有不兼容迁移：按该发布专门制定的前向修复或恢复预案处理，不能盲目切回旧镜像。

实施后的命令接口应包括 `docker compose --env-file <release-config> -f deploy/compose.yaml config --quiet`、`up -d --wait web api`、`ps`，以及单独 migration profile 的显式命令。使用占位路径指导配置，不写入真实凭据。

## 9. 上线前待确认信息与当前验证状态

待确认：服务器 OS/CPU 架构与可用内存、域名、生产数据服务是否已有、首次上线是否需要搬迁本机数据、TLS 签发方式、镜像传递方式。资源规格依测试负载决定，本方案不在未知负载下承诺具体容量。

当前已准备镜像/Compose/代理/预检与操作文档，并完成数据库无关的代码质量门；检查结果以验收记录为准。当前终端未找到 docker 可执行文件，因此没有进行镜像构建、Compose 启动、HTTPS、真实容器停机或回退演练。用户已有阿里云服务器，PostgreSQL 在本机、向量服务在云端；生产数据库方案和服务器细节仍待确定。
