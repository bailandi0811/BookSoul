# BookSoul 生产上线流程

按顺序执行本指南中的步骤。细节、故障排查与历史验收见 [Docker 部署手册](docker.md) 与 [部署验收记录](docker-acceptance.md)。小说 OSS 直传版本额外步骤见 [小说 OSS 上传版本部署](novel-upload.md)。

**执行位置约定**

| 标记 | 含义 |
| --- | --- |
| **本地** | 开发机仓库根目录；Windows 使用 PowerShell，Docker Desktop 须为 Linux 容器模式 |
| **服务器** | 阿里云 Linux 服务器；命令在已同步本仓库的目录或绝对路径下执行 |

**架构要点（避免误操作）**

- 生产只跑 **一个** API 容器，内嵌 ingestion worker；不要同时跑 systemd 旧 API 与 Compose API 写同一库。
- Compose 的 `web` 直接占用 **80/443**；与宿主 Nginx 并行时会冲突，切换前须停掉占用端口的旧服务。
- 数据库迁移 **不会** 随 `activate` 自动执行；有 Prisma 迁移时必须先 `migrate deploy` 再切应用。
- 镜像输入须为 **已提交** 源码；未提交改动不会进入发布镜像。

---

## 0. 上线前清单

在跑任何「切流量」命令前确认：

| 项 | 说明 |
| --- | --- |
| 域名与备案 | 正式域名（如 `booksoul.fun`）已备案且 DNS A 记录指向服务器公网 IP |
| TLS | 服务器目录内有 `fullchain.pem`、`privkey.pem`（见下文 `TLS_HOST_DIR`） |
| 数据服务 | PostgreSQL、Milvus/Zilliz、模型 API 从 **容器内** 可达；数据库/Redis 主机在 app 配置中通常为 `host.docker.internal`，不是 Windows 本机 `127.0.0.1` |
| ACR | 阿里云容器镜像服务已建三个私有仓库：`booksoul-api`、`booksoul-web`、`booksoul-migration` |
| 路径 | 上传目录宿主机绝对路径、UID **1000:1000** 可读写；示例见 `deploy/release.env.example` |
| 质量门 | 本地已跑通 `client` 与 `server` 的 `npm run check`（发布脚本会再跑一遍） |

---

## 1. 本地：构建并推送到 ACR

**位置：本地（仓库根目录）**

1. 确认工作区干净、改动已提交，记录当前 commit。
2. 按 ACR 控制台命令登录（密码勿写入仓库或 release 文件）：

```powershell
docker login crpi-<你的实例>.personal.cr.aliyuncs.com
```

3. 生成 release ID 并发布。**`-Registry` 必须是「ACR 公网域名 + `/` + 命名空间」**，不要 `https://`，不要只写域名：

```powershell
$revision = git rev-parse --short=8 HEAD
$release = 'r' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $revision
Write-Host "Release ID: $release"
powershell -NoProfile -File scripts/publish-acr.ps1 `
  -Release $release `
  -Registry crpi-<你的实例>.personal.cr.aliyuncs.com/booksoul
```

正确示例：`crpi-abc123.cn-hangzhou.personal.cr.aliyuncs.com/booksoul`  
错误示例：只有 `...personal.cr.aliyuncs.com`（缺 `/booksoul`）或含 `crpi-<占位符>`。

4. 成功后打开 `.superpowers/releases/<release>.env`，复制其中的三条 **`仓库@sha256:...`** 坐标；下一步写入服务器 release 文件。终端应出现 `Published <release>` 与 `Image coordinates: ...`。

若 ACR 暂时不可用，可改用 `docker save` / `docker load` 离线传镜像，流程见 [Docker 部署手册 §2](docker.md#2-构建发布版本)。

---

## 2. 服务器：准备 release 与应用配置

**位置：服务器（路径在仓库外，勿提交 Git）**

### 2.1 Release 坐标文件

创建 `/etc/booksoul/releases/<release>.env`（`<release>` 与上一步一致），六个变量均必填，路径用 **绝对路径**、单行 `KEY=value`、无引号：

```dotenv
WEB_IMAGE=<ACR>/booksoul-web@sha256:...
API_IMAGE=<ACR>/booksoul-api@sha256:...
MIGRATION_IMAGE=<ACR>/booksoul-migration@sha256:...
APP_ENV_FILE=/etc/booksoul/app.env
UPLOAD_HOST_DIR=/home/admin/booksoul-data/books
TLS_HOST_DIR=/etc/booksoul/tls
```

`UPLOAD_HOST_DIR` 用服务器上**真实**上传目录绝对路径（示例为常见轻量机布局；与 `deploy/release.env.example` 中的 `/srv/...` 二选一，以实际为准）。

首次部署以 [deploy/release.env.example](../../deploy/release.env.example) 为模板；**更新版本**时只替换三个 `*_IMAGE`，保留并核对 `APP_ENV_FILE`、`UPLOAD_HOST_DIR`、`TLS_HOST_DIR`。

**权限（用 `admin` 跑 preflight/prepare 时必做）**：`/etc/booksoul` 若仅为 `700 root:root`，`admin` 读不到 release、TLS 或写不了 `current.env`。建议：

```bash
sudo chown root:admin /etc/booksoul /etc/booksoul/releases /etc/booksoul/tls
sudo chmod 750 /etc/booksoul /etc/booksoul/releases /etc/booksoul/tls
sudo chmod 640 /etc/booksoul/releases/*.env /etc/booksoul/app.env
sudo chmod 640 /etc/booksoul/tls/fullchain.pem /etc/booksoul/tls/privkey.pem
sudo chown root:admin /etc/booksoul/tls/fullchain.pem /etc/booksoul/tls/privkey.pem
```

核对：`cat /etc/booksoul/releases/<release>.env | wc -l` 应为 **6**（不要用无 `sudo` 的 `cat` 误判权限）。release 文件内无密钥，但仍保持 `640`。

### 2.2 应用环境文件

创建或更新 `APP_ENV_FILE` 指向的文件（如 `/etc/booksoul/app.env`）。字段说明见 [server/.env.example](../../server/.env.example)，**不要**从开发机 `.env` 整文件复制。

生产最小示例（值换成真实凭据）：

```dotenv
NODE_ENV=production
PORT=3000
BOOK_UPLOAD_DIR=/data/books
CORS_ORIGINS=https://booksoul.fun
DATABASE_URL=postgresql://...@host.docker.internal:5432/booksoul?schema=public
JWT_ACCESS_SECRET=<独立随机密钥>
OPENAI_API_KEY=<服务端密钥>
OPENAI_BASE_URL=<模型服务地址>
MODEL_NAME=<对话模型>
EMBEDDING_MODEL_NAME=<1024 维 Embedding 模型>
MILVUS_ADDRESS=<容器可达地址>
MILVUS_TOKEN=<凭据>
AGENT_ADMISSION_MODE=redis
REDIS_URL=redis://:<密码>@host.docker.internal:6379
```

说明：

- `AGENT_ADMISSION_MODE=redis` 时须配置容器可达的 `REDIS_URL`；勿因连不上静默改 `local`（多实例也不支持 local）。
- 启用注册/找回密码邮件时增加 `AUTH_CHALLENGE_SECRET` 与 `AUTH_PUBLIC_BASE_URL=https://booksoul.fun` 及 SMTP 相关项。
- 启用 OSS 直传时增加 OSS 字段并核对 Bucket/CORS，见 [novel-upload.md](novel-upload.md)。
- Docker `--env-file` 与 preflight 均要求 **无引号** 的 `KEY=value`；带引号的值（如 `SMTP_FROM="..."`）会报 `APP_ENV_FILE: must be a readable env file`。邮件 From 可写成 `SMTP_FROM=noreply@你的域名` 或无外层引号的显示名。
- Docker raw 读取不会去掉引号，Milvus 等键若带字面双引号会导致容器启动失败。

权限：release 与 app 文件仅部署管理员可读；TLS 目录只读挂载进 Nginx。

### 2.3 同步部署脚本

**位置：服务器**

后续 `cd` 的目录必须同时包含：

- `deploy/compose.yaml`
- `deploy/preflight.mjs`
- `deploy/booksoul-deploy.sh`、`deploy/booksoul-deploy.mjs`

仅含 `compose.yaml` + `preflight.mjs` 的旧包（例如历史上的 `booksoul-deploy-001`）**不够**，需从本仓库 **手动上传** 上述两个脚本，或 `git clone` 完整仓库到固定目录（GitHub 不通时可 Gitee 或只传 `deploy/`）。

注意：`~/booksoul` 若只有 `client/`、`server/` 而没有 `deploy/`，那是旧 systemd 源码树，**不能**在该目录跑 Compose 发版。

部署用户需能访问 Docker：`sudo usermod -aG docker <用户>` 后重新登录，或 `prepare`/`activate` 中对 docker 使用与 `docker login` 一致的 `sudo`。

---

## 3. 服务器：预检与拉取镜像（不切流量）

**位置：服务器（仓库中的 `deploy/` 目录所在路径）**

设变量（`<release>` 换成实际 ID）：

```bash
export RELEASE='<release>'
export RELEASE_FILE="/etc/booksoul/releases/${RELEASE}.env"
export DEPLOY_ROOT="/home/admin/booksoul-deploy-001"   # 含完整 deploy/ 的目录，按实际修改
cd "$DEPLOY_ROOT"
```

1. 登录 ACR（与后续 `docker compose` / `docker pull` 使用同一 Linux 用户；若用 `sudo docker`，则 `sudo docker login`）：

```bash
docker login crpi-<你的实例>.personal.cr.aliyuncs.com
```

2. 配置预检（不连库、不启动服务）。成功时输出 `PASS: deployment files checked...`：

```bash
node deploy/preflight.mjs --release "$RELEASE_FILE"
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml config --quiet
```

3. 拉取并核对 digest（**不**改 `current.env`、**不**替换已在跑的容器）：

```bash
bash deploy/booksoul-deploy.sh prepare "$RELEASE"
```

成功时最后一行：`Prepared <release>; no services or current release were changed.`

若已有旧 Compose 占 80/443，**prepare 仍可执行**；只有 **activate** 会重建 web/api。若宿主 Nginx 与 Compose web **同时**抢 80/443，须在 activate 前停掉宿主 Nginx。

---

## 4. 维护窗口：迁移与切换

**位置：服务器**

选择低峰时段。切换会短暂中断 SSE/WebSocket；塔罗牌局为进程内状态，重启后失效。

### 4.1 备份与迁移状态（只读）

```bash
# 自行完成 PostgreSQL 可恢复备份后再继续
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml \
  --profile migration run --rm --no-deps migration migrate status
```

核对输出中的 host/port/database/schema 与预期生产库一致。`migrate deploy` 会应用 **全部** 待执行迁移，不只是最新一个。

### 4.2 停旧写库进程

停止所有会向生产库写入的 API/worker，例如：

- `sudo systemctl stop booksoul`（若仍在跑 systemd 旧 API）
- 停止占用 80/443 的宿主 Nginx（若 Compose web 即将接管）

Compose 内 API 若已在跑，维护窗口内也要先停：

```bash
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml stop api
```

### 4.3 执行迁移（有待迁移时）

```bash
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml \
  --profile migration run --rm --no-deps migration migrate deploy
```

迁移失败 **立即停止**，不要 `activate`。禁止 `migrate reset`、`down -v`。

### 4.4 激活新版本

**推荐**用 root 执行 activate，以便写入 `/etc/booksoul/current.env`（线上版本指针）：

```bash
sudo docker login crpi-<你的实例>.personal.cr.aliyuncs.com   # 若平时 pull 用 sudo docker
sudo bash deploy/booksoul-deploy.sh activate "$RELEASE"
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml ps
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml exec web nginx -t
```

`docker compose ps` 中 api/web 的 IMAGE 应带本次 release 的 `@sha256:...`，且 STATUS 为 **healthy**。

成功时脚本会输出 `Activated <release>; current release updated...`。若容器已 healthy 但脚本报 **`EACCES ... current.env`**，说明指针未写入、**不等于**回滚；补写：

```bash
sudo cp "/etc/booksoul/releases/${RELEASE}.env" /etc/booksoul/current.env
sudo chown root:admin /etc/booksoul/current.env
sudo chmod 640 /etc/booksoul/current.env
```

任何 activate 失败时，用 `docker compose ps` 与 `docker inspect` 看实际运行的镜像 digest，**不能**只看 `current.env` 判断线上版本。

---

## 5. 上线验收

**位置：浏览器 + 必要时服务器只读命令**

| 检查 | 预期 |
| --- | --- |
| `https://<正式域名>` | 证书有效，页面可打开 |
| 登录 / 刷新 | Cookie Secure、HttpOnly；刷新后仍登录 |
| 阅读 + 单书助手 | 已有书可读；提问有流式输出；停止后不再继续 |
| 上传（授权后） | 合成 TXT/EPUB 至 `READY`（会产生 Embedding 费用） |
| 书友客厅 | WebSocket 连通；公开运营前完成管理员初始化（见下） |

社区管理员（**服务器**，需显式 `DATABASE_URL`，不加载 `.env`）：

```bash
cd server
DATABASE_URL='postgresql://...' npm run community:moderator -- --member-id=<公共成员 UUID>
# 核对预览输出后，再加 --apply 授予权限
```

更完整的 WS/代理项见 [书友客厅验收](../community-chat-acceptance.md)。

---

## 6. 后续发版（已有生产环境）

**无数据库结构变更**

1. **本地**：§1 生成新 `<release>` 并 push。
2. **服务器**：新建 `/etc/booksoul/releases/<新 release>.env`（只换三个 digest）。
3. **服务器**：`prepare` → 低峰 **`sudo bash deploy/booksoul-deploy.sh activate ...`** → §5 抽检。

**有 Prisma 迁移**

在 `activate` 前重复 §4.1–§4.3（停写库 → `migrate deploy` → 再 `activate`）。旧镜像能否回退取决于 schema 是否仍兼容旧应用；见 [Docker 部署手册 §5–§6](docker.md#5-更新和回退)。

---

## 7. 常见报错速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Registry must be a registry host and one namespace` | `-Registry` 缺 `/命名空间` 或含占位符 | 使用 `域名/booksoul` |
| `release: must be a readable env file` | `/etc/booksoul` 为 `700`，admin 进不去 | §2.1 权限；或 `sudo node deploy/preflight.mjs` |
| `TLS_HOST_DIR: must already exist with required access` | TLS 目录或 pem 对 admin 不可读 | §2.1 对 `tls/` 与证书 `640` |
| `APP_ENV_FILE: must be a readable env file` | app.env 含引号/重复键/非法行 | 去掉值外层引号；用 §2.2 诊断思路自查格式 |
| `docker.sock: permission denied` | 用户不在 `docker` 组 | `sudo usermod -aG docker admin` 重登，或 `sudo` 跑 deploy |
| `booksoul-deploy.sh: No such file` | deploy 目录不完整 | §2.3 补脚本或 clone 完整仓库 |
| `EACCES ... current.env` | admin 无法在 `/etc/booksoul` 创建文件 | §4.4 用 `sudo activate` 或手动 `sudo cp` |
| migrate 有 Pending 仍 activate | 跳过迁移 | 先 §4.3 `migrate deploy` 再 activate |

---

## 8. 禁止事项

- 不要把生产 `app.env`、release 文件或 Registry 密码提交 Git、贴进聊天或打进镜像。
- 不要对生产库执行 `migrate reset`、全表 `deleteMany`、或 `docker compose down -v`。
- 不要在未停旧 API 的情况下对同一库并行跑两套写库服务。
- 不要在 80/443 仍被占用或未备 TLS 时执行 `activate`。

---

## 9. 相关文档

| 文档 | 用途 |
| --- | --- |
| [docker.md](docker.md) | 完整部署手册、宿主 PostgreSQL/Redis、回退与故障 |
| [docker-acceptance.md](docker-acceptance.md) | 历史验收状态与未跑项 |
| [novel-upload.md](novel-upload.md) | OSS 上传迁移与 CORS 核对 |
| [server/README.md](../../server/README.md) | 配置项、数据库测试门禁、社区命令 |
