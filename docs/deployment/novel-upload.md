# 小说 OSS 上传版本部署

本次变更增加 `20261011090000_book_upload_sessions` 迁移。开发机迁移已完成，不代表服务器已经迁移。继续使用现有 Docker/ACR 发布流程，详见 [Docker 部署手册](docker.md)。当前 Compose 的 API 内嵌 worker 保持启用，无需增加独立 worker 容器；新旧版本 worker 不得混跑。

## 1. 本地发布镜像

先提交客户端、服务端等镜像输入，再确认 Docker Desktop 使用 Linux 容器，并按 ACR 控制台命令登录。Windows 自带的 PowerShell 5.1 或 PowerShell 7 中，在仓库根目录运行，Registry 替换为现有实际地址：

```powershell
$revision = git rev-parse --short=8 HEAD
$release = 'r' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $revision
& .\scripts\publish-acr.ps1 -Release $release -Registry '<实际 ACR 域名>/<实际命名空间>'
```

发布脚本会重新检查、构建并推送 API、web、migration 三个镜像。成功后在 `.superpowers/releases/<release>.env` 生成三个 digest 坐标；这不是完整的服务器 release 配置。把新版本所需的部署脚本同步至服务器，在 `/etc/booksoul/releases/<release>.env` 创建完整版本文件，使用新 digest，保留并核对当前 `APP_ENV_FILE`、`UPLOAD_HOST_DIR` 和 `TLS_HOST_DIR`。不要覆盖当前版本文件或泄露应用凭据。

## 2. OSS 与生产环境核对

- 服务器应用配置中已有成组 `OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID` 和 `OSS_ACCESS_KEY_SECRET`，按现有需要使用 `OSS_ENDPOINT`。确认地域、Bucket 与实际身份一致；配置变更由管理员确认后执行。
- Bucket 保持私有，为当前服务身份绑定 [目录级权限模板](book-upload-oss-policy.example.json)，替换占位 Bucket。保留头像等原有权限。
- CORS 使用实际生产 HTTPS 前端 Origin，允许 POST/PUT、请求头 Content-Type；需要读取 ETag 时暴露该响应头。本机 localhost 规则不能代替生产域名规则。
- 暂存生命周期只作用于 `booksoul/books/staging/`；同时清理未完成分片。不要给正式 `sources/` 配置无条件过期删除。
- 保留旧本地原文的卷挂载。本次上线不会迁移或删除旧小说源文件。
- 当前 Compose 内嵌 worker 不应设置 `BOOK_INGESTION_WORKER_ENABLED=false`；只有另行部署并验证独立 worker 后才能关闭 API 内的 worker。

## 3. 预检、停机与迁移

以下命令在 Linux 仓库根目录执行，版本 ID 换为实际值。先确认现有部署使用该 Compose、生产配置和外部 application 网络；若仍有宿主 Nginx 或 systemd 旧 API，按当前部署实际安排停机与端口交接，不额外启动第二套服务。

```bash
RELEASE='<实际 release ID>'
RELEASE_FILE="/etc/booksoul/releases/${RELEASE}.env"
bash deploy/booksoul-deploy.sh prepare "$RELEASE"
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml --profile migration run --rm --no-deps migration migrate status
```

核对生产数据库 host、port、database、schema，完成可恢复备份并记录当前镜像 digest、源文件挂载和活动任务。检查全部待应用迁移及 SQL；本次上传迁移以外的待迁移必须另行审核。`migrate deploy` 会部署所有待应用迁移，不能假设只执行最新一个。迁移状态返回“有待迁移”时需要审核，不代表可跳过迁移。

维护窗口内停止所有旧 API/worker，包括 Compose 之外的实例。下面 stop 仅覆盖当前 Compose API：

```bash
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml stop api
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml --profile migration run --rm --no-deps migration migrate deploy
bash deploy/booksoul-deploy.sh activate "$RELEASE"
docker compose --env-file "$RELEASE_FILE" -f deploy/compose.yaml ps
```

迁移失败立即停止发布。发布命令失败时核对实际容器 digest，不根据 current.env 推断容器已回退。禁止 `migrate reset`、`down -v` 或删除数据目录。应用回退必须先核对 schema 兼容性；数据库备份恢复是单独操作。

## 4. 验收

刷新前端，用合成 UTF-8 TXT 和 EPUB 分别上传。小文件 OSS POST 应返回 204，确认接口成功且书籍最终进入 READY；核对章节、阅读和书内问答。使用 10–50 MiB 合成文件验证暂停、重新选择原文件续传和分片确认。真实上传、索引和模型验收会写入数据并可能产生费用，应在获授权的目标执行。

既有书籍必须继续可读；不同用户不能访问对方上传会话和原文。检查 worker 和清理日志，无持续 P2021/P2022、P2028 或存储拒绝错误。若 OSS 返回 403，读取 Response 的 Code、Message、EC 定位，不公开签名 URL、表单或密钥。`0006-00000227` 表示表单不满足上传 Policy，应核对新镜像及签名字段，而不是扩大 RAM 权限。

本地 mock 测试通过不代表真实生产 OSS/CORS、数据库并发或模型服务验收完成。
