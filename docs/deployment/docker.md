# Docker 单机部署手册

此部署保留本地 Vite/NestJS 开发流程。生产仅运行一个后端实例，API 和 ingestion worker 同进程；前端由 Nginx 提供，并代理 API、SSE 和 WebSocket。数据库、向量服务和上传原文独立保存。

当前已知：阿里云轻量应用服务器为 Ubuntu 24.04.2、x86_64、2 核/2 GiB 内存/40 GiB 系统盘；已使用既有 Ubuntu 软件源安装 Docker 29.1.3 与 Compose 2.40.3。三个 release-001 镜像已在本地 Docker Desktop 构建，通过基础检查并经上传校验导入服务器；服务器 API 依赖/UID 检查通过。已有 systemd 管理的旧 BookSoul、占用 80 的宿主 Nginx、宿主 PostgreSQL 16 和 Redis；向量服务在云端。服务器 `booksoul/public` 的 User、Book、ChatSessionRecord、MemoryRecord 计数均为 0，已成功应用仓库前五个迁移；文件配置的脱敏目标与该数据库一致，同机数据库/旧配置备份已确认。不能将四表为空当作整个数据库可丢弃。

旧服务保持运行。首次发布还需安排宿主 PostgreSQL/Redis 的容器可达方式，以及 Nginx 80/443 端口的演练与切换；目前 Compose 的默认端口不能直接与宿主 Nginx 并行启动。不得原样复制 localhost 数据地址、重置数据库、删除旧项目或清理云端向量。本手册不会自动搬迁本机数据库。

当前运行验证状态见 [验收记录](docker-acceptance.md)。首次生产部署前必须通过隔离演练；仅有配置文件不代表已上线。

## 1. 部署前准备

阿里云信息获取：打开 ECS 控制台，选择实例所在地域，进入“实例”，点击实例 ID，在详情页查看操作系统、CPU/内存、磁盘和带宽。[阿里云官方指引](https://help.aliyun.com/zh/ecs/user-guide/view-instance-information)

若已能连接 Linux 服务器，可运行以下只读命令，检查系统和 Docker；不要运行安装、重置或清理命令：

```bash
cat /etc/os-release
uname -m
free -h
docker --version
docker compose version
```

提供系统版本、架构、CPU/内存、磁盘容量与 Docker 版本即可，不需要提供账号密码、API Key 或连接密钥。找不到 ECS 实例时确认是否购买的是“轻量应用服务器”，应在对应产品控制台查看。

- Linux 服务器，确定 CPU 架构与资源容量；Docker Engine、Compose **2.30 或更高**（使用 raw env_file），构建端 Node 22、npm 10。
- 域名解析到服务器、有效 HTTPS 证书和续期安排。仅开放 80/443；api 3000 和数据服务不得公开。
- 明确生产 PostgreSQL、Milvus/Zilliz、模型服务及按需 Redis/SMTP/OSS/MCP 目标。服务器不能直接访问 Windows 本机 localhost。
- 数据库与向量目标、上传目录和备份分别核对。没有现成的生产数据服务时另行准备，不自动复制本机数据。
- 独立原文目录、TLS 目录、生产配置文件。原文目录必须允许 api 的 UID/GID **1000:1000** 读写；权限由管理员按实际目录安排，不对已有目录执行递归 chmod/chown。
- 证书目录中使用 `fullchain.pem` 和 `privkey.pem`，由 Nginx 只读挂载；生产配置文件仅部署管理员可读。

以下路径仅是 Linux 示例：`/etc/booksoul/release.env`、`/etc/booksoul/app.env`、`/etc/booksoul/tls`、`/srv/booksoul/books`。按真实环境选择，禁止覆盖已有配置或数据。

## 2. 构建发布版本

在已确认发布范围的仓库根目录执行。当前存在大量未提交工作，发布前记录实际文件清单/哈希，不能只用 commit 标识构建内容。

先按仓库规则运行相关测试和两个包质量门；数据库测试须排除，测试不注入生产 env。随后在 Linux 容器中构建（Windows 可用 Docker Desktop 的 Linux 容器模式）：

```bash
docker build -f server/Dockerfile --target runtime -t booksoul-api:release-001 .
docker build -f server/Dockerfile --target migration -t booksoul-migration:release-001 .
docker build -f client/Dockerfile -t booksoul-web:release-001 .
docker run --rm --network none --entrypoint node booksoul-api:release-001 -e "require('@prisma/client'); require('sharp'); require('fs').accessSync('dist/main.js')"
docker run --rm --network none --entrypoint ./node_modules/.bin/prisma booksoul-migration:release-001 --version
```

构建安装依赖会访问 npm 与官方镜像源，不注入生产凭据，不连接数据库，不发送小说原文。基础镜像固定 digest；升级基础镜像后重新构建与验收。核对 API 用户非 root，最终镜像无凭据、私人文件或本地运行数据。确认目标 CPU 与构建镜像架构一致。

Windows 上若 Docker Desktop 已配置代理、普通镜像拉取成功，但构建在 `auth.docker.io` 获取令牌时超时，先独立验证代理连通性。本次环境中，为启动构建命令的 PowerShell 会话设置 `HTTP_PROXY`、`HTTPS_PROXY` 后通过；两者使用实际本地 HTTP 代理地址，例如 `http://127.0.0.1:端口`。这些会话变量供构建客户端联网使用，不是应用配置，也不要把宿主机的 127.0.0.1 代理作为容器 RUN 的代理地址。关闭该 PowerShell 窗口即可结束会话变量；不修改 .env 或持久系统环境变量。

正常发布使用阿里云 ACR 私有仓库。2024 年 9 月后创建的个人版实例使用控制台分配的 `crpi-...personal.cr.aliyuncs.com` 独享端点；不要根据地域手拼旧版 `registry.cn-...` 地址。个人版本身无 SLA，只适合作为当前小规模阶段的发布通道，最近一个已验证的归档和服务器旧镜像仍需保留。服务器是轻量应用服务器，同地域不自动证明 ACR VPC 端点可达；先实际解析、登录和拉取，VPC 端点不可达时使用控制台给出的公网端点。

先在 ACR 创建三个私有仓库 `booksoul-api`、`booksoul-web`、`booksoul-migration`。本地构建身份使用 push 权限，服务器尽量使用独立只读 RAM 身份。执行 `docker login` 与部署命令的 Linux 身份必须一致；普通用户登录后再用 `sudo docker compose` 会读取另一份 Docker 凭证。固定密码不写脚本、release 文件或仓库，登录时使用控制台给出的完整命令。

发布标识使用 `rYYYYMMDDTHHMMSSZ-<Git 短 SHA>`，例如 `r20261009T120000Z-c9996337`。UTC 时间让同一源码在部分 push 失败后能用新标识安全重试，已成功上传的孤立 tag 不覆盖、不部署，后续按显式清理流程处理。相关镜像输入必须没有未提交改动；根目录旧 tar 的变化不会进入镜像输入检查。登录 ACR 后，在仓库根执行：

```powershell
pwsh scripts/publish-acr.ps1 `
  -Release r20261009T120000Z-c9996337 `
  -Registry crpi-实际实例.cn-hangzhou.personal.cr.aliyuncs.com/booksoul
```

脚本依次运行两个包现有质量门、构建三个 `linux/amd64` 镜像、执行无网络镜像检查、逐个 push，并检查每条原生命令的退出码。只有三次 push 都返回 digest 后，才在 Git 忽略的 `.superpowers/releases/` 生成三条 digest 固定的镜像坐标。脚本不登录 ACR、不读取密码、不 SSH 到服务器，也不覆盖已有 release 清单。同一工作区的发布由本地文件锁串行化；跨工作区或跨机器仍必须保证同一 ACR namespace 同时只有一个发布者，并为每次尝试使用新的 release ID。若 ACR 实例支持 tag 不可变策略，应同时启用，不能把“先检查 tag、再 push”视为远端原子操作。

使用 digest 坐标在服务器创建完整的 `/etc/booksoul/releases/<release-id>.env`。从当前 release 复制时只替换 `WEB_IMAGE`、`API_IMAGE`、`MIGRATION_IMAGE`，保留并核对 `APP_ENV_FILE`、`UPLOAD_HOST_DIR`、`TLS_HOST_DIR` 三个实际绝对路径；首次部署则以 `deploy/release.env.example` 为结构模板填写。release 文件不得包含 Registry 密码。

ACR 不可用或尚未开通时，可使用镜像归档作为离线备用方案：

```bash
docker save -o booksoul-release-001.tar booksoul-api:release-001 booksoul-migration:release-001 booksoul-web:release-001
# 安全传输后，在服务器执行：
docker load -i booksoul-release-001.tar
```

记录三个 image ID、平台及归档 SHA-256；使用仓库时记录 repo digest。不得把归档提交到 Git。传到服务器的是已验收的同一镜像，而不是在服务器重新构建。推送到外部仓库需要确认仓库权限和发布范围。

## 3. 配置

参照 `deploy/release.env.example` 在服务器准备独立 release 文件，其中六个变量全部必填：`WEB_IMAGE`、`API_IMAGE`、`MIGRATION_IMAGE`、`APP_ENV_FILE`、`UPLOAD_HOST_DIR`、`TLS_HOST_DIR`。路径使用绝对路径；镜像使用版本标签或 digest。

生产 app 文件参考现有 `server/.env.example` 的字段说明，使用以下值和实际凭据，不复制本地 `.env`：

```dotenv
NODE_ENV=production
PORT=3000
BOOK_UPLOAD_DIR=/data/books
CORS_ORIGINS=https://你的正式域名
DATABASE_URL=填实际生产连接地址
JWT_ACCESS_SECRET=填独立随机密钥
OPENAI_API_KEY=填实际服务端密钥
OPENAI_BASE_URL=填现有模型服务地址
MODEL_NAME=填现有对话模型
EMBEDDING_MODEL_NAME=填现有1024维Embedding模型
MILVUS_ADDRESS=填服务器可达地址
MILVUS_TOKEN=填实际凭据
AGENT_ADMISSION_MODE=local
```

已有准入模式为 redis 时保持 redis，并填写实际 `REDIS_URL`；不因连接失败改用 local。当前单实例可使用 local，不在此步骤新引入 Redis。注册/重置邮件启用时配置独立 `AUTH_CHALLENGE_SECRET` 和 HTTPS `AUTH_PUBLIC_BASE_URL`；其他可选能力按服务端说明配置。

两个文件使用单行、无引号的 `KEY=value`，不加行尾注释或变量插值；app 文件采用 Compose raw 模式，密钥内 `$` 和 `#` 按原样传递。保持本机 `.env` 原样。不要把生产文件放入 Git、镜像或聊天输出。

配置无网络预检需要 Node 22；可在有 Node 的部署控制端执行，或把原文/TLS/app 文件按实际路径只读映射到 Node 容器后执行。宿主机检查成功仍不能代替 api UID 权限验收。

本次宿主 PostgreSQL 部署使用预先创建的外部网络 `booksoul_application`，经当前路由核对后选择 `172.30.0.0/24`、网关 `172.30.0.1`。Compose 不负责创建或删除此网络；创建前检查实际子网、冲突与同名网络，不复用不匹配的网络。api 与 migration 通过 `host.docker.internal:host-gateway` 连接宿主服务；当前 Linux host-gateway 对应 `172.17.0.1`。只在新的容器配置中改变数据库主机，保留已有凭据与 booksoul/public 目标。宿主 PostgreSQL 保留 localhost、仅额外监听上述 Docker 网关，并按现有应用数据库角色对应用子网配置 scram-sha-256 规则；修改前备份，重启影响需授权。开机顺序需保证 Docker 网桥在 PostgreSQL 启动前建立。具体执行门槛见[宿主数据库连接计划](../superpowers/plans/2026-10-07-docker-deployment.md#宿主-postgresql-连接方案)。

```bash
node deploy/preflight.mjs --release /etc/booksoul/release.env
docker compose --env-file /etc/booksoul/release.env -f deploy/compose.yaml config --quiet
```

预检验证必需值、目录、证书文件存在和生产地址格式；不连接依赖、不验证证书有效期/域名或真实 UID 权限。额外只读核对证书链、域名、数据服务连通性及剩余磁盘。不要公开完整 `compose config`、`inspect` 环境字段或凭据。

## 4. 首次启动与验收

仅在服务器目标、生产配置和隔离演练结果已确认后执行。默认 `up` 不迁移数据库，不创建数据服务。

```bash
docker compose --env-file /etc/booksoul/release.env -f deploy/compose.yaml up -d --wait web api
docker compose --env-file /etc/booksoul/release.env -f deploy/compose.yaml ps
docker compose --env-file /etc/booksoul/release.env -f deploy/compose.yaml exec web nginx -t
```

api 根路径探针代表进程响应，不能证明模型、向量或数据库完整健康。`restart: unless-stopped` 在进程退出时恢复，不会因为 unhealthy 自动重启。

通过真实域名检查 HTTPS、登录恢复和已有书籍阅读；Cookie 必须 Secure/HttpOnly，刷新后仍登录。SSE 逐段响应、取消、WS、上传 READY、跨用户拒绝等有写入/费用的验收应先在独立环境与合成数据上完成。生产模型调用、发送邮件、上传或删除需要具体操作授权。

本机开发域名、HTTP 和自签名证书不能替代生产 HTTPS 认证验收。测试证书可在独立演练环境使用，浏览器须信任它。

## 5. 更新和回退

无数据库结构变化时：记录当前镜像与版本 → 发布并记录 digest → 在服务器创建新的完整 release 文件 → prepare → 经切流量授权后 activate → 验收。部署工具默认从 `/etc/booksoul/releases` 读取版本文件并把成功版本写入 `/etc/booksoul/current.env`；可分别用 `BOOKSOUL_RELEASE_DIR`、`BOOKSOUL_CURRENT_ENV`、`BOOKSOUL_COMPOSE_FILE` 覆盖路径。

```bash
# 只预检、拉取和核对镜像；不启动服务、不改变 current.env
bash deploy/booksoul-deploy.sh prepare r20261009T120000Z-c9996337

# 明确切换：会重建 web/api，并占用 Compose 声明的 80/443
bash deploy/booksoul-deploy.sh activate r20261009T120000Z-c9996337
```

`prepare` 运行仓库预检、Compose config、pull 和三个 digest 镜像 inspect。`activate` 重复这些安全检查，待 `up -d --wait --force-recreate web api` 和 `ps` 全部成功后，才原子更新 `current.env`；失败不会把 current 文件指向候选版本。注意 Compose 更新不是事务：`up` 返回失败前可能已经替换部分容器，此时 `current.env` 仍是旧值，但不代表旧版本仍完整运行。先用 `docker compose ... ps` 和 `docker inspect` 核对实际容器 digest，再根据数据库兼容性修复后重试候选版本或重新 activate 旧 release，不能只根据 `current.env` 判断或盲目自动回退。包装脚本使用 `flock` 拒绝并发部署。它不执行数据库迁移，也不自动回退运行容器，因为迁移后的旧应用未必仍与 schema 兼容。

当前 Compose web 直接发布 80/443。在宿主 Nginx 仍占用这些端口或尚未明确切流量时，只能执行 `prepare`，不得执行 `activate`。若服务器实际部署状态已经变化，先重新核对端口、TLS、当前 release 和活动任务，不沿用本手册的历史状态推断。

同时重建 web 以确保代理配置生效；Nginx 还通过 Docker DNS 动态解析 api。更新会短暂中断活动连接，后端重启丢失塔罗临时状态。选择低峰，先等待活动索引与聊天尽可能结束；120 秒停机宽限不是无损或零停机承诺。

停机开始后，新 HTTP 业务请求和 WS 升级返回 503，活动请求按既有超时收尾，随后清理数据/工具连接。真实容器强制终止后的取消与租约恢复仍须演练。前端旧标签页若请求已经被新版替换的懒加载资源，可能需要刷新；上线前须实测，不能承诺旧标签页无缝切换。

原文挂载和数据服务不随镜像替换。严禁 `down -v`、清理带卷的 prune、reset 或重建/清空数据库。

没有不兼容数据库迁移时，对旧 release ID 再执行一次 `activate` 并验收。旧 release 文件必须仍使用已记录的 digest，不能临时把新 tag 改成旧 tag。回退应用不回写数据库、向量和源文件；有迁移时先按下一节判断旧应用兼容性。

## 6. 数据库迁移

migration 容器不启动 API/worker，不自动运行。执行前必须核对 host/port/database/schema、备份、全部待应用迁移、兼容性及该目标的授权。已有 schema 不等于新镜像没有待部署迁移。

核对状态（只读，结果含数据库目标，勿公开输出）：

```bash
docker compose --env-file /etc/booksoul/release.env -f deploy/compose.yaml --profile migration run --rm --no-deps migration migrate status
```

确认后才执行：

```bash
docker compose --env-file /etc/booksoul/release.env -f deploy/compose.yaml --profile migration run --rm --no-deps migration migrate deploy
```

破坏性或非幂等迁移先给出单独恢复路径并明确确认。需要停机的迁移应停止 API/worker，再按该次迁移说明处理；不得和恢复任务并发。迁移失败停止发布。不运行 migrate reset，不修改已应用迁移。旧应用不兼容新 schema 时，禁止盲目换回旧镜像。

## 7. 备份、证书与故障检查

- PostgreSQL、源文件和向量库分别备份；记录 owner/book/version 范围与模型版本。原文备份不公开。恢复只在已核对且获授权的目标上执行，恢复后只读校验。
- TLS 续期由既定证书流程执行，保留相同文件名，验证新证书匹配私钥与域名，再 `exec web nginx -t` 和 `exec web nginx -s reload`。Nginx 必须挂载证书目录，以读取续期后的文件。
- 后端不健康：核对服务连通性、运行版本和脱敏错误。Redis 模式不可用时修复 Redis，不修改模式绕过门禁。
- 502：核对 api 健康、Docker 网络与代理解析。登录刷新失败：核对 HTTPS、CORS 与 Cookie；流式卡住：核对代理缓冲与合法超时。
- 服务器直接由 Nginx 接入，应用生产模式只信任一跳代理，Nginx 覆盖转发客户端 IP。若增加 CDN/负载均衡，必须重新设计可信代理边界，不能直接叠加上线。
- 日志检查前遵守隐私约束；Nginx access 日志不记录请求路径与查询参数，以免记录重置 Token。错误日志仅记录严重级别，排查时不要临时公开敏感请求。

验收要求和未运行项必须保留在 [验收记录](docker-acceptance.md)，不能因为容器显示 running 就报告上线完成。
