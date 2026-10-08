# BookSoul Docker 部署实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本计划推荐主 Agent 在当前会话顺序执行；未经用户选择不派发子 Agent。

**Goal:** 保留本地开发流程，建立可构建、可验证、可更新、可回退应用版本的 Linux 单机容器部署。

**Architecture:** Nginx web 镜像提供静态前端及 HTTPS 代理，单个 NestJS api 容器继续包含 worker。外部数据服务和上传目录独立于应用容器，数据库迁移使用显式 migration profile。

**Tech Stack:** Node 22、npm 10、现有 React/Vite、NestJS/Prisma、Docker BuildKit、Compose v2、Nginx；不新增 npm 生产依赖。

**Spec:** [已确认设计](../specs/2026-10-07-docker-deployment-design.md)。

## 全局约束

- 本地 `npm run dev`、`npm run start:dev` 和 Vite 代理保持原样。
- 默认目标是 Linux 单机、一个 API 实例，同进程运行 ingestion worker。
- 保留 npm、现有锁文件和业务架构；不修改本地 `.env`、不搬动或清理现有数据，不自动迁移数据库，不创建分支或提交。
- 默认上传原文上限为 50 MiB；代理请求体上限先设 64 MiB 以容纳 multipart 开销，服务端仍执行自身上限。
- 停机宽限暂设 120 秒；不能保证宽限内完成所有任务，超时恢复须另行验收。
- 镜像、TLS、数据库、上传和向量目标分别核对。真实外部写入、发布、迁移和模型费用仍需要针对目标的授权。
- 不改变现有 CI 质量门。测试前审查实际脚本、发现范围、环境加载与目标；默认检查数据库无关。
- 当前有大量用户未提交改动，编辑前重读目标文件，只做必要增量；不格式化整个仓库。

## Review Focus

1. Windows 构建产物或缺失的 Prisma/原生依赖导致 Linux 镜像无法启动：任务 1 验证最终镜像实际加载。
2. 后端容器替换后 IP 改变，Nginx 仍连接旧地址：任务 3/4 验证更新和域名解析。
3. HTTPS Cookie、Origin 和来源限流在代理后行为错误：任务 3/4 验证刷新、拒绝路径与不同来源。
4. 信号关闭先断数据库而 worker 仍写入，或模型资源未释放：任务 2/4 验证关闭顺序与强制终止恢复。
5. 测试或迁移入口误连真实数据，或重建丢失原文：任务 3/4 验证缺少隔离证明拒绝写入，持久化校验一致。

## 执行顺序和环境门槛

任务 1–3 可以先编写并完成数据库无关验证；没有 Docker 时保留源文件，记录未运行的构建与代理检查，不自动安装 Docker。任务 4 依赖可用 Docker 和已证明隔离的数据环境；任务 5 的生产执行依赖服务器信息与明确授权。

当前计划不选择具体域名、CPU 架构、证书供应商或生产数据库地址。这些是执行环境输入，不以虚构值替代真实验收。

## Task 1：制作可复现的前后端镜像

**Files:** Create `.dockerignore`、`client/Dockerfile`、`server/Dockerfile`。

**Interfaces:** 仓库根为 build context；客户端默认输出 web 镜像，服务端有 `runtime` 和 `migration` 两个目标。api 工作目录 `/app/server`、启动 `node dist/main.js`；migration 使用本地锁定 Prisma CLI，不加载应用模块。生产镜像不包含本机配置或数据。

- [ ] 审查 COPY 清单、锁文件、编译输出及运行时文件读取。确认 `.dockerignore` 排除 `.env*`、上传/聊天/记忆数据、私人 EPUB/TXT、node_modules、dist、日志、Git、工具状态；保留构建所需公开静态资产和源文件。
- [ ] 用固定 digest 的 Node 22 Debian 基础镜像在 Linux 内执行 `npm ci`、`prisma generate`、`npm run build`；最终 api 只保留生产依赖、编译输出和生成引擎，以非 root 用户运行。前端只将构建资产复制到固定版本 Nginx。先核对 registry 可用版本，不写未经确认的 digest。
- [ ] migration 目标包含 Prisma CLI、schema 和全部现有迁移。默认 CMD 不执行迁移；api entrypoint 不执行迁移。
- [ ] Docker 可用后，在仓库根执行 `docker build -f server/Dockerfile --target runtime -t booksoul-api:verify .` 与 `docker build -f server/Dockerfile --target migration -t booksoul-migration:verify .`；web 在任务 3 代理文件准备后构建。期望均退出 0，构建无数据库连接或真实外部 API 调用。
- [ ] 执行 `docker run --rm --network none --entrypoint node booksoul-api:verify -e "require('@prisma/client'); require('sharp'); require('fs').accessSync('dist/main.js')"`，期望退出 0。验证运行 UID 非 0；检查最终文件清单与 COPY 范围，确保无凭据和私人原文；不打印秘密内容。
- [ ] 执行 `docker run --rm --network none --entrypoint ./node_modules/.bin/prisma booksoul-migration:verify --version`，期望打印锁定版本并退出，不下载包、不连接数据服务。

## Task 2：验证容器信号与应用关闭顺序

**Files:** Modify `server/src/main.ts`；Test/Create `server/src/main.spec.ts`；必要时仅修正 `server/src/ingestion/ingestion-worker.service.ts` 与相邻测试的生命周期逻辑。

**Interfaces:** Nest 应用接收 SIGTERM/SIGINT；worker 停止领新任务并等待已开始任务；连接关闭不得先于使用它的活动任务。超时后由容器终止，任务保持现有可恢复状态。

- [ ] 先用不导入真实 AppModule 的 mock NestFactory 测试启动入口，断言信号处理启用，配置 CORS 和正常 listen 不变。禁止该测试初始化 Prisma、Milvus 或读取真实 `.env`。
- [ ] 运行 `npm test -- --runInBand src/main.spec.ts`（server 目录），确认新增信号行为用例在修复前失败。
- [ ] 在现有入口启用 shutdown hooks；审查 Nest 生命周期调用顺序。用延迟完成的 mock worker 与 mock 连接测试：关闭过程中不再领取任务，活动任务结束前连接不被释放。已有 worker shutdown 测试可扩展，不仅断言方法被调用。
- [ ] 若单独启用 hooks 不能满足关闭顺序，明确列出必要变更后再写最小修复；不通过 catch 吞错掩盖关闭问题，不新增并行 worker 架构。
- [ ] 运行 `npm test -- --runInBand src/main.spec.ts src/ingestion/ingestion-worker.service.spec.ts src/chat/admission/agent-admission.service.spec.ts src/chat/admission/agent-admission.store.spec.ts`。先审查上述测试均使用 mocks。期望全部通过。
- [ ] 检查 Jest 发现范围和环境加载，证明数据库集成测试排除后执行 server `npm run check`；报告现有无关失败，不修改无关代码。

## Task 3：Compose、TLS、代理及配置预检

**Files:** Create `deploy/compose.yaml`、`deploy/nginx.conf`、`deploy/release.env.example`、`deploy/preflight.mjs`、`deploy/preflight.test.mjs`。

**Interfaces:** Compose 服务名 `web`、`api`、`migration`；migration 只在 `migration` profile。发布配置包含 `WEB_IMAGE`、`API_IMAGE`、`MIGRATION_IMAGE`、`APP_ENV_FILE`、`UPLOAD_HOST_DIR`、`TLS_HOST_DIR`；容器原文路径固定 `/data/books`，TLS 文件名 `fullchain.pem`、`privkey.pem`。示例配置不包含真实值。

- [ ] 在 release 示例明确区分部署插值配置与 api 运行配置。必填值缺失使 Compose 失败；upload/TLS 挂载禁止自动创建不存在的宿主机目录。api env_file 的路径与 release 文件解析规则在文档中固定。
- [ ] 用 `node:test` 为无网络预检编写回归用例：缺少配置、目录不存在、目录不可写、证书不存在、应用上传路径与挂载不一致、生产 CORS 为 HTTP/localhost 时返回非零；有效临时 fixture 返回 0。测试只使用系统临时目录，错误不输出凭据。
- [ ] 编写 `deploy/preflight.mjs`，使用 Node 标准库。入口接收 `--release <file>`，不默认读取 `.env`。验证上述条件及单机目标，不自动 chmod、创建目录、修配置或连接数据库；非 root UID 的实际写权限在容器演练中验证。
- [ ] Compose 配置 api 不发布宿主机端口，使用 init、`restart: unless-stopped`、`stop_grace_period: 120s`、受限日志轮转和 root endpoint 进程探针。web 等待 api healthy；migration 无重启策略且不挂载原文，不启动 worker。
- [ ] Nginx 配置 80 转 HTTPS、保留 `/api` 前缀、64 MiB 请求体、关闭 API 响应缓冲/压缩、WS Upgrade 转发及 Origin 保留。读取超时先设 300 秒，并在预检说明应用超时变更时须核对它。index 禁止长期缓存，仅 hash 资源使用长缓存。
- [ ] 配置后端地址在容器 IP 更新后重新解析，使用固定支持该机制的 Nginx 版本并实际验收；同时在更新指令中重建 web，避免依赖未验证的解析行为。
- [ ] 审查代理来源 IP 限流。若需调整 trust proxy，先制定实际代理边界及回归测试，不能直接设置无条件 true；扩大源码范围前更新方案。
- [ ] 执行 `node --test deploy/preflight.test.mjs`。Docker 可用且隔离 fixture 配置准备后，执行 Compose `config --quiet`、构建 web 镜像以及 fixture 环境中的 `nginx -t`；期望全部退出 0，不输出完整环境变量。

## Task 4：隔离环境功能、持久化和回退演练

**Files:** Create `docs/deployment/docker-acceptance.md`；不直接修改现有 `server/scripts/validate-private-reader-e2e.mjs`。若需要通用自动 E2E 入口，先另行审阅当前脚本的目标参数和清理范围，再补充计划。

**Interfaces:** 独立 `*_test` 数据库及 `test_*` schema、独立向量集合、独立上传目录、合成账号和小说、HTTPS 测试域名及证书；所有目标与真实目标做指纹比较。记录不包含身份、凭据和原文。

- [ ] 验证隔离目标和授权：缺失/无法比较时不运行写入验收；演练配置绝不挂载本地真实上传目录，不自动创建测试数据库，不修改现有 `.env`。
- [ ] 运行预检及 Compose 启动等待，记录镜像 ID/digest、基础镜像、架构和工具版本；确认 api 未对公网暴露，进程探针只代表存活。
- [ ] 经合成数据外部调用授权后，创建两名测试用户，验证 HTTPS 登录/刷新、Cookie 属性、错误 Origin、跨用户访问拒绝、上传 READY、阅读/讨论范围、逐段 SSE、停止生成、WS 长连接和来源限流。
- [ ] 使用 fixture 验证 50 MiB 限额与 64 MiB 代理边界，确认服务端超限拒绝；向未认证访问者请求上传路径，确认不可访问。
- [ ] 重建 api/web，比较合成书 ID、章节数量、阅读位置、历史和源文件哈希；记录全部相同。用容器实际 UID 验证挂载读写权限，而不只检查宿主机权限。
- [ ] 使用两个可区分发布版本演练更新、旧标签页与缓存、Nginx 后端地址更新，再回退整个 web/api 版本；确认登录、阅读及授权提问仍正常。
- [ ] 在独立 fixture 中验证 SIGTERM 和超时终止场景：停止领取、活动资源取消/释放、重启后任务按 stale 规则恢复，未重复产生成功或清理副作用。只终止已核对的演练容器。
- [ ] 将备份恢复到另一独立目标并只读校验；恢复/删除操作获得针对该目标的确认，不覆盖原测试或真实环境。
- [ ] 每项记录 PASS/FAIL/NOT RUN、版本、时间和脱敏证据。任何核心失败阻止上线；没有真实模型验收时明确记录限制。

## Task 5：落地发布手册与上线交接

**Files:** Create `docs/deployment/docker.md`；Modify `readme.md` 仅增加部署入口；更新 `docs/deployment/docker-acceptance.md`。

**Interfaces:** 手册将无迁移更新、显式迁移、回退和证书续期分开。Linux 服务器的配置由用户按模板准备，不由 Agent 自动覆盖。

- [ ] 编写首次部署清单：OS/CPU、Docker 与 Compose 版本、域名、TLS、端口、数据依赖可达性、原文目录 UID 权限、备份、配置注入、磁盘空间、发布版本。Docker 安装为独立用户操作，不自动安装。
- [ ] 固定无迁移发布命令顺序：预检 → `docker compose --env-file <release> -f deploy/compose.yaml config --quiet` → 获取镜像 → `up -d --wait --force-recreate web api` → `ps` → 域名只读验收。拉镜像前确认传递方式；镜像不存在且未选仓库时采用已验证的 save/load 流程。
- [ ] 写明 migration profile 使用 `run --rm --no-deps migration` 调用本地 Prisma CLI 的完整命令；执行前核对目标、备份、全部待应用迁移与授权，失败停止。禁止普通 up 自动迁移。
- [ ] 固定回退为切回记录的旧版 web/api 镜像并重建；数据库不回写。若数据库不兼容，停止并采用该次发布已审阅的恢复方案。
- [ ] 记录证书续期、Nginx 校验/reload、日志检查和故障排查，强调不公开环境变量或日志中的私人内容。
- [ ] 若只新增构建/配置文件，运行相关静态与构建检查；若改动源码，按 AGENTS 运行受影响包质量门。最终检查 diff、文件链接、命令与验收记录，无密钥或生成物。
- [ ] 收集服务器/域名/数据目标并获得实际发布授权后执行生产流程。生产验收只读；没有服务器或授权时交付“部署文件已准备，尚未上线”，不能宣称已部署。

## 完成状态与交接

2026-10-07：用户确认后已由主 Agent 顺序实施。

| 任务 | 当前结果 | 尚未满足的门槛 |
| --- | --- | --- |
| 1 镜像 | 三个 release-001 镜像已构建并完成无网络基础检查；归档上传校验、服务器导入与 API 依赖/UID 检查通过 | 前端 HTTPS/Nginx 配置与完整应用运行验收尚未执行 |
| 2 停机 | 信号、HTTP/WS 门禁与资源关闭时序已实现；完整 server check 通过 | 真实容器 SIGTERM/强制终止验收归任务 4 |
| 3 Compose/代理 | 配置、26 项预检测试及 YAML 静态解析通过 | Compose config、nginx -t、HTTPS 与 UID 权限需运行环境 |
| 4 隔离演练 | 验收记录已建，Docker 已可用 | 等待隔离数据目标、TLS 与外部调用授权 |
| 5 手册/上线 | 手册和根 README 入口已完成 | 生产服务器细节与 PostgreSQL 方案尚未确定，没有上线 |

必要增量：根模块停止接收新请求、WS 停机拒绝、数据库/Redis/MCP 在 application shutdown 阶段释放，以满足设计的停机要求。用户已有改动保留，本地配置和数据未动。详细结果以 [验收记录](../../deployment/docker-acceptance.md) 为准；未满足环境条件的步骤仍保持未完成，不把文件准备当作上线完成。

## 宿主 PostgreSQL 连接方案

用户已明确授权本次配置修改与 PostgreSQL 重启。Compose 已准备外部应用网络和宿主映射；服务器配置文件路径、数据库角色与防火墙仍须在修改前核对。

已知：PostgreSQL 16 当前 listen_addresses=localhost，端口 5432；pg_hba_file_rules 无解析错误，仅 loopback TCP 使用 scram-sha-256。服务器默认 Docker bridge 为 172.17.0.0/16、网关 172.17.0.1，云内网路由为 172.19.0.0/18。当前路由与 Docker 网络没有占用候选应用子网 172.30.0.0/24；执行前仍复核。

- [ ] 只读核对实际 postgresql.conf / pg_hba.conf 路径、配置来源/覆盖、UFW 状态与现有应用数据库角色；不得打印 URL、密码、密钥或密码 hash。若存在新网段冲突、额外配置覆盖或访问限制，停止并修订方案。
- [ ] 获得本次具体授权后，将 Compose application 网络设为预先创建的 external 网络 booksoul_application，固定 172.30.0.0/24、网关 172.30.0.1；api/migration 增加 host.docker.internal:host-gateway 映射。创建前拒绝覆盖同名且不匹配的网络。
- [ ] 在服务器将实际 PostgreSQL 配置文件保存至新的受限备份目录，记录权限、原始哈希和修改项。保留现有 listen_addresses 的 localhost，额外增加 172.17.0.1；不使用 * 或 0.0.0.0。
- [ ] pg_hba.conf 仅新增 host booksoul <现有应用数据库角色> 172.30.0.0/24 scram-sha-256；角色从已有配置安全读取并验证，不猜名称、不使用 all 角色或 trust。保存前审查现有规则优先级及解析结果。
- [ ] 为 postgresql@16-main.service 新增独立且不覆盖已有文件的 systemd drop-in，设置 Wants=docker.service 与 After=docker.service，使开机时数据库启动顺序位于 Docker 网桥初始化之后。
- [ ] 在新容器配置文件中仅将已核对 DATABASE_URL 的主机改为 host.docker.internal，保留账号、密码、5432/booksoul/public；旧 app.env 与本机 .env 保持原样。其他环境字段适配另行核对，禁止直接启动 API/worker。
- [ ] 执行前告知 PostgreSQL 重启会中断旧连接；确认旧应用当前没有活动任务/事务，在允许的时间重启该 cluster。只读验证监听仅 loopback 与 172.17.0.1、5432 没有监听公网接口，旧服务正常；使用受限 env 文件和 migration 镜像在指定网络中仅查询 SELECT 1 及目标指纹，不执行 migrate deploy。
- [ ] 如配置或启动失败，仅恢复本次备份的数据库配置、撤回本次新建的 drop-in，再重启旧 cluster 并做只读验证；不恢复/覆盖数据库数据，不删除 Docker 数据卷。外部应用网络可以保留，不为回退而清理数据。

成功条件：旧应用仍可通过 localhost 连接；指定应用网络中的容器使用现有角色连接 booksoul/public；没有公网数据库监听、没有数据或 schema 写入。配置备份与变更记录可用于撤回本次修改。Redis、向量目标、TLS 与正式应用切换不属于本次数据库连接修改。
