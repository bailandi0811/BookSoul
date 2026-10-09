# Docker 部署验收记录

## ACR 发布工具实现（2026-10-09）

本节仅记录仓库内工具和离线测试，没有登录 ACR、推送或拉取真实镜像、连接服务器、修改生产配置、执行迁移或切换流量。

| 检查 | 当前状态 | 证据/限制 |
| --- | --- | --- |
| 发布/部署脚本行为 | PASS | `node --test deploy/preflight.test.mjs deploy/release-scripts.test.mjs`：39/39；使用临时 fixture、假 Git/npm/Docker 和假 flock，无网络或真实 Docker。覆盖 push 失败、脏镜像输入、Git SHA 不匹配、远端 tag 已存在、本地并发发布互斥、digest 固定、migration profile 拉取、prepare 无切换、健康后更新 current、激活失败保留旧 current 并提示核对部分切换、路径穿越和 Bash 委托 |
| 脚本语法 | PASS | Node `--check`、PowerShell parser、Git Bash `-n` 均退出 0 |
| client 质量门 | PASS | 沙箱外串行复跑 `npm run check` 退出 0：60 files / 270 tests、lint、typecheck、build；首次与 server 并行运行时一个既有 5 秒测试超时，隔离该文件 5/5 后串行全量通过；保留既有 Browserslist 数据过期和 Vite plugin timings 提示 |
| server 质量门 | PASS | 沙箱外 `npm run check` 退出 0：115 suites / 746 tests、typecheck、build；45 条既有 lint warning、0 errors |
| ACR 个人版实例、仓库和凭据 | NOT RUN | 需要用户在控制台创建/确认实际实例、三个私有仓库、公网与 VPC 端点以及最小权限身份 |
| 真实 build/push/digest | NOT RUN | 未调用本机 Docker daemon 或外部 Registry；待 ACR 信息确认并取得真实外部写入授权后执行 |
| 服务器 prepare/activate | NOT RUN | 未连接服务器；先只执行 prepare，80/443、TLS、当前 release 和活动任务重新核对并单独授权后才允许 activate |

日期：2026-10-07。范围：部署准备；没有上线，没有连接真实数据库/向量目标，没有迁移或发送合成小说到模型服务。

| 检查 | 当前状态 | 证据/限制 |
| --- | --- | --- |
| 官方基础镜像版本与 digest | PASS | 只读查询 Docker 官方 registry；固定 Node 22.19.0-bookworm-slim、Nginx 1.28.3-alpine |
| 预检有效配置与拒绝路径 | PASS | `node --test deploy/preflight.test.mjs`：26/26；临时 fixture，无数据库或网络连接，含 raw 密钥与云端向量 URL |
| 信号与停机阶段回归 | PASS | mock 应用/Prisma，HTTP/WS 临时夹具；新请求拒绝、票据不消费、连接关闭顺序验证，包含于服务端全量测试 |
| server 质量门 | PASS | `npm run check` 退出 0；115 suites / 746 tests、类型检查与构建通过；45 条现有 lint warning、0 errors。事先确认默认数据库测试排除 |
| client 质量门 | PASS | `npm run check` 退出 0；60 files / 263 tests、lint 与构建通过；不改本地启动或配置 |
| Compose YAML 静态语法 | PASS | 使用现有 js-yaml 解析；api 不发布宿主端口，migration 有独立 profile；不等同于 Compose config/runtime 验证 |
| 宿主数据库 Compose config | PASS（本地临时配置） | 获授权后增加 booksoul_application 外部网络、api/migration 的 host-gateway 映射；Docker Compose config 解析成功并验证映射及 API 无 ports。空临时 app 配置，不连接数据服务、不创建网络或容器；云端实际配置尚未验证 |
| 迁移 SQL 与敏感文件过滤审查 | PASS | 修复独立审查发现的 SQL 过滤错误；私人 SQL/env/原文 fixture 排除；真实迁移镜像内确认 11 份 migration.sql 存在，无 .env |
| 云服务器 Docker 安装 | PASS（用户终端证据） | Ubuntu 软件源 docker.io 29.1.3，Client/Server 均响应；Compose 2.40.3；旧 API/Nginx/PostgreSQL/Redis 四项 active。容器运行和镜像下载仍待验证 |
| 云端数据库/旧配置同机备份 | PASS（用户确认） | 用户确认 pg_dump 与旧 app.env 备份命令成功；pg_restore --list 结构检查通过。未执行恢复演练，不记录备份私有路径 |
| 后端镜像构建、依赖/UID | PASS | Docker Desktop：`booksoul-api:release-001` 构建退出 0；linux/amd64，user=node；无网络、无挂载临时容器验证 Prisma、Sharp、dist/main.js，UID=1000 |
| 前端与迁移镜像构建 | PASS | web 与 migration 均为 linux/amd64；web 的 index.html/nginx.conf 存在、Nginx 1.28.3；无网络临时容器运行 Prisma 6.19.3 --version，UID=1000，未迁移数据库 |
| Compose config 与 nginx -t | NOT RUN | 尚无演练 TLS 与部署配置；静态文件检查不等同于 Nginx 配置或服务启动验收 |
| HTTPS Cookie、流式、WS、来源限流 | NOT RUN | 需要隔离运行环境和 HTTPS |
| 合成上传 READY、隔离、防剧透 | NOT RUN | 需要独立测试库、向量集合、上传目录及外部调用授权 |
| 容器替换、原文持久化、回退 | NOT RUN | 需要两版镜像与隔离 fixture |
| 超时强制终止后恢复 | NOT RUN | mock 停机回归不能替代真实容器恢复验收 |
| 备份恢复演练 | NOT RUN | 需要独立恢复目标及授权 |
| 生产上线 | NOT RUN | 服务器、域名、生产数据服务与发布授权未提供 |

运行阶段补充：OS/CPU、Docker/Compose 版本、镜像 ID/digest、源码发布清单、脱敏数据目标指纹、fixture 范围、命令退出码、备份与回退证据。不要记录真实凭据、完整用户身份或原文。

本地构建补充：Windows Docker Desktop 4.94.0 / Engine 29.8.2，hello-world 已运行成功。直接经过现有本地 HTTP 代理访问 Docker 认证服务返回 HTTP 200，普通 `docker pull docker/dockerfile:1` 成功；构建进程另设 HTTP_PROXY / HTTPS_PROXY 后通过认证并完成后端构建。未修改本机 .env 或持久环境变量。后端镜像 ID：`sha256:445d1ab2a2f95ca7c862184ea7d51cba0123285c5e1649014b38681a208ca1e6`。

前端镜像 ID：`sha256:9ef8c784b57dcefeb1fd9a3e25670e7d298d1c004c4b2cde4ca1f933c36a7d27`。迁移镜像 ID：`sha256:6e84d44f8de9c6e204d717ced2d07377e1e876a9ae17d76fefdaa673c48fb036`。用户完成前端构建后，本地 inspect 验证镜像已存在；迁移镜像由 Agent 构建，退出 0。两者临时容器检查均禁用网络且无宿主挂载。

三个镜像已通过 docker save 导出为 booksoul-release-001.tar，退出 0；大小 532390912 字节，SHA-256 为 `d77a1f356652e37594a56800d98eca198346157b2562ea7f6fd6f5df341589da`。归档与校验文件放在 Git 忽略的 .superpowers 发布目录；云端上传和导入证据见下，尚未切换应用服务。

云端传输补充（用户终端截图）：Workbench 上传完成后，`sha256sum -c` 返回 booksoul-release-001.tar: OK；`docker load` 返回三个 release-001 镜像已加载。服务器镜像列表确认 api、web、migration 均存在。用户随后在服务器使用无网络、无挂载的临时 API 镜像容器验证 Prisma、Sharp 与 dist/main.js，输出“检查通过，运行用户 UID=1000”。这证明云端后端运行环境检查通过；应用服务、真实依赖连接、数据库迁移和服务切换尚未执行。此前服务器直连 Docker Hub 的 hello-world 拉取超时没有被当作容器运行通过。

用户确认正式域名为 booksoul.fun，ICP备案仍在审核。计划正式访问地址为 https://booksoul.fun；尚未验证 DNS、TLS 证书或该域名的生产登录闭环。

用户已授权宿主 PostgreSQL 配置修改与重启。只读输出确认 listen_addresses=localhost、5432、pending_restart=false，访问规则仅 loopback TCP 使用 scram-sha-256、无解析错误；Docker 仅默认 bridge/host/none，网关 172.17.0.1；当前 Docker 网络和云内网路由未占用候选 172.30.0.0/24。尚未修改云端 PostgreSQL 或重启；待核对配置实际来源、现有数据库角色与防火墙。

服务器目标核对补充（用户终端输出）：配置文件 /etc/postgresql/16/main/postgresql.conf，HBA 文件 /etc/postgresql/16/main/pg_hba.conf；listen_addresses 来自 default，port=5432 来自主配置文件。旧 .env 安全解析确认数据库角色 booksoul，未输出密码或完整 URL；UFW status=inactive。下一步为新的受限配置备份与创建 booksoul_application 网络，尚无完成证据。

用户终端确认两份 PostgreSQL 配置已复制到新建的受限备份目录，cmp 比对均通过；记录只保留备份存在及校验结果，不提交实际备份位置。booksoul_application 网络已创建，driver=bridge，subnet=172.30.0.0/24，gateway=172.30.0.1。尚未修改监听/HBA 或重启数据库。

首次配置追加未通过“所有 pg_file_settings.error 必须为空”的门禁，脚本报告已恢复原配置、数据库未重启，未展示具体错误行。PostgreSQL 16 文档说明 error 也可表示配置不能在启动后应用，不能直接等同于语法错误；listen_addresses 属于启动参数。当前尚未证明此次触发原因，下一步临时重现并输出必要错误字段，结束时恢复并 cmp 核对原配置；不重启、不放宽未知错误。

诊断结果（用户终端输出）：临时配置仅 listen_addresses 显示 applied=false / setting could not be applied，新增 booksoul 网段规则的 error 为空；诊断结束已恢复两份配置并 cmp 校验，数据库未重启。确认首次门禁将需重启的参数误判为配置失败。已准备新的操作脚本：postgres -C 按启动配置解析并核对有效监听值，只允许上述精确字段/值/错误组合，其他错误继续阻断；任务/事务检查、启动顺序、重启与监听校验、配置失败恢复均显式执行。当前只完成 Bash 语法检查，尚未在服务器运行。

用户终端随后以正确的 PostgreSQL 配置备份目录执行该脚本，前置备份、应用网络、活动任务/事务和启动顺序检查均通过。`postgresql@16-main` 重启成功，`listen_addresses=localhost,172.17.0.1`、`pending_restart=false`，实际仅监听 `127.0.0.1:5432` 与 `172.17.0.1:5432`；没有监听公网地址，没有执行迁移，也没有启动新 API。容器到数据库的只读连接仍待验证。

随后使用 `booksoul-api:release-001` 在 `booksoul_application` 网络中执行一次只读查询，未挂载宿主文件、未执行迁移。结果确认 `database=booksoul`、`schema=public`、`role=booksoul`、服务地址 `172.17.0.1/32:5432`；查询后临时容器删除。旧 `booksoul.service`、Nginx、PostgreSQL 均保持 active，旧 API 本机 HTTP 响应正常。

旧应用配置脱敏审计确认：生产模式、正式 HTTPS 域名、JWT、模型服务和云端 Zilliz 配置已具备，现有上传目录存在且为空。容器配置仍需移除仅供旧机内调试的 HTTP localhost CORS 来源，并将 `DATABASE_URL` 主机改为 `host.docker.internal`。准入模式为 Redis，现有 `REDIS_URL` 指向宿主 `127.0.0.1:6379`，容器不可直接访问；不得静默切换为 local，须先核对宿主 Redis 的监听和认证方式。邮件认证、SMTP、OSS、Tavily 和独立塔罗供应商当前未配置。

宿主 Redis 脱敏审计确认版本 7.0.15，仅监听 `127.0.0.1:6379` 与 `[::1]:6379`，`protected-mode=yes`、TLS 端口关闭，本机无凭据 `PING` 返回 PONG；旧配置因此依赖未认证的 default 用户。不能仅增加 Docker 网关监听，否则会扩大未认证访问面。下一步先核对 Redis 数据/客户端范围，再决定带备份、认证和回退的接入变更。

Redis 数据范围检查确认总键数与 BookSoul 准入键数均为 0，只有 default ACL 用户，AOF 关闭且最近 RDB 状态正常。用户已明确授权 Redis 加固、旧 `.env` 更新和 Redis/旧 API 重启。已准备受保护的执行脚本：只增加 `172.17.0.1` 监听，禁用 default，创建仅限准入键前缀与实际命令的 booksoul ACL，生成随机凭据并更新旧服务 URL；失败恢复原 Redis 配置和旧 `.env`。转换与拒绝路径测试 5/5、部署 Node 测试合计 31/31、Bash/Node 语法及 diff 检查通过；生产执行尚待服务器输出确认。

服务器执行证据确认两个上传文件哈希正确，候选配置与备份检查通过。Redis 与旧 API 重启成功，未认证访问拒绝、管理命令拒绝、宿主认证连接以及 `booksoul-api:release-001` 容器内受限 EVAL 均通过；备份保留，Redis 仍仅用于 BookSoul 准入数据。此步骤没有执行数据库迁移，也没有启动新 API。

迁移镜像只读状态检查确认目标为 `host.docker.internal:5432/booksoul`、`public` schema，共 11 个迁移，前 5 个已完成，以下 6 个待应用：`20261002090000_auth_email_challenges`、`20261003090000_book_reading_position`、`20261004100000_user_profile_media`、`20261004113000_community_chat`、`20261004183000_raise_reading_progress_from_position`、`20261005100000_community_mentions_visible_read`。本地 SQL 审查未发现 DROP/TRUNCATE/删除列；前四个主要新增类型、表、列、索引和外键，第五个幂等地插入/提升既有阅读进度但不降低 FINISHED，最后一个新增 mentions 列和可见已读表。`migrate deploy` 仍未执行，待针对该目标的明确迁移授权。

用户截图随后确认迁移容器执行成功：显示 `No pending migrations to apply`，复核显示 `Database schema is up to date!`。同一终端最后的旧 API `curl 127.0.0.1:3000` 检查失败且远程连接断开，因此旧 API 恢复状态仍待重连后核对，不能把整段发布验收视为完成。

重连后用户执行恢复检查，旧 `booksoul.service` 在第 1 次尝试恢复本机 HTTP 响应，`ActiveState=active`、`SubState=running`、`ExecMainStatus=0`，Node 正常监听 `*:3000`。这证明迁移后旧服务已恢复；该端口仍是旧 systemd API，不代表 Docker API 或前端已经切换。

容器切换前只读检查确认：`booksoul.fun` 和 `www.booksoul.fun` 当前没有 DNS 解析输出；宿主 Nginx 的正式域名配置仅监听 `127.0.0.1:8080`，公网 80 是 default server；服务器没有找到 TLS 证书文件。旧配置的上传目录已确定为 `/home/admin/booksoul-data/books`，目录存在且为空。当前可先做无公网端口的 API canary，正式 web 切换需先完成 DNS 与证书准备。

用户已确认创建独立容器环境文件并启动 API canary。该文件从旧 `.env` 派生，数据库/Redis 主机改为 `host.docker.internal`、上传目录改为 `/data/books`、CORS 仅保留正式 HTTPS 来源；旧 `.env` 不覆盖。canary 使用 release-001 API 镜像、`booksoul_application` 网络和既有空上传目录，不发布宿主端口，验证后停止并清理临时容器。

首次 canary 启动命令因 Bash 历史展开破坏了健康检查 shell，后续只读核对发现容器实际以 exit=1 退出；容器仍保留，原因和日志尚待脱敏诊断，不能把 canary 标记为通过。

canary 日志随后定位为 `Invalid Milvus book collection name`。脱敏字节检查确认旧 `.env` 的集合名值带字面双引号；Node dotenv 读取时会去引号，但 Docker `--env-file` raw 读取会保留双引号。旧配置未修改；容器环境生成器需改为基于 dotenv 解析后的所有键重写无引号 `KEY=value` 文件，再重新验证。

修正后的容器环境文件以 mode 600 写入，集合名显示为无引号值；`booksoul-api:release-001` canary 在第 6 次尝试通过容器内 HTTP 检查，状态 `running/exit=0/oom=false`，随后临时容器已停止并删除。该启动过程实际初始化并验证了 PostgreSQL、Redis、Zilliz 和模型配置；旧 `.env` 未修改。API 容器 canary 验收通过。

数据库隔离必须证明 `TEST_DATABASE_URL` 指向独立 `*_test` 数据库和 `test_*` schema，并完整比较生产目标指纹。向量集合与上传目录独立验证。现有 reader E2E 有固定本机 API 地址与写入/清理，不直接对当前开发库或生产库运行。

独立审查报告了迁移 SQL 被忽略的问题并已修复；审查器因使用额度限制未完成剩余审查，随后进行了本地源码检查。没有把局部审查或静态检查当作真实容器验收。

用户提供的环境：阿里云轻量服务器，Ubuntu 24.04.2 / x86_64 / 2 核 / 2 GiB / 40 GiB；已从既有 Ubuntu 软件源安装 Docker 29.1.3 和 Compose 2.40.3。Docker 官方密钥下载曾报 curl 35 connection reset，未成功安装 docker-ce；随后按实际 apt candidate 使用 Ubuntu 维护的软件包，不混装两套 Docker。宿主 Nginx 监听 80，旧 API 监听 3000，由 booksoul.service 管理；PostgreSQL 16 监听 127.0.0.1:5432，Redis 正在运行。旧应用配置文件存在，默认 uploads/books 目录不存在，不能据此判断没有其他位置的原文。

用户提供的只读查询：服务器 booksoul/public 的 User、Book、ChatSessionRecord、MemoryRecord 均为 0；前五个迁移 completed=true、rolled_back=false。本地仓库另有六个迁移尚未出现在该记录中：auth_email_challenges、book_reading_position、user_profile_media、community_chat、raise_reading_progress_from_position、community_mentions_visible_read。这里只比较迁移名称，尚未核对已应用迁移 checksum，也未执行迁移。

用户提供的脱敏配置指纹：127.0.0.1 / 5432 / booksoul / public，与上述查询目标一致；仅证明文件中配置，未检查运行进程的环境覆盖。同机数据库/配置备份已确认完成。后续继续核对其他表/任务及上传位置，再决定容器与宿主数据库网络和 Nginx 切换。生产迁移、初始化和发布均未执行。
