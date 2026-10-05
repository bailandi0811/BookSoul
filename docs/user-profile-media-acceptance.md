# 用户资料与私人图片验收

2026-10-04。对应[开发方案](superpowers/plans/2026-10-04-user-profile-oss-media.md)。本记录区分源码实现、模拟验证和真实部署，不将模拟上传当作 OSS 联调成功。

## 实现结果

名称复用 `User.name`，登录用户只能修改本人资料；头像支持上传、更换和恢复默认。七张既有壁纸仍为系统素材，个人图库只包含本人 READY 图片，最多 4 张，以便和系统景色共用同一条展开画廊。已有超过 4 张的图库仍会显示，但不能继续上传。默认随机从系统图与本人图库抽取，固定模式可选系统图、本人图或纯色；切页、资料链接刷新和上传新图不重抽，删除当前固定图原子恢复随机。

上传采用签发、浏览器 PostObject 直传、服务端确认三阶段。服务端重新核对 owner、字节、MIME、真实格式、静态帧和像素，剥离元数据并规范化为私有 WebP；正式对象写入后才在事务内更新资料。签发配额和 revision 使用用户行锁，重复确认旧资源不恢复旧头像。私人读取链接仅在内存保存，身份变化同步清除媒体及在途请求。

未配置 OSS 时禁用上传，不阻断名称和系统壁纸设置；签名失败保留合法资源 ID，以占位和显式重试呈现。原图不发送给模型、向量库或额外图像服务。对象保留、收费、RAM/CORS 和清理范围以开发方案为准；本轮未启用定期清理。

## 自动检查

| 检查 | 实际结果 |
| --- | --- |
| 服务端 `npm run check` | lint、类型检查、73 个测试套件 / 482 个测试、Nest 构建通过；44 个既有 lint warning，无 error |
| 客户端 `npm run check` | lint、47 个测试文件 / 188 个测试、类型检查和 Vite 构建通过；既有 Browserslist 数据过期提示，不扩展更新范围 |
| 服务端全部源码及测试 `tsc --noEmit -p tsconfig.json` | 通过；旧认证 fixture 仅补齐本次新增 User 字段 |
| Prisma schema 校验 | 通过；新增 SQL 为加法迁移，后续本机部署见下文 |
| 默认 `jest --listTests` | 73 个套件，不包含 `.db.spec.ts`；默认测试使用 mock，不加载真实数据库或 OSS |
| `git diff --check` | 通过 |

回归覆盖 owner 拒绝、非法请求、revision 冲突、配额、图片伪装/损坏/动画/尺寸、输出元数据、超时取消、幂等确认、孤儿对象追踪与精确清理。独立审查发现的事务写入期间取消、图库满额时确认重试、头像过期链接重试均已修复并增加用例。

`test:db:profile` 专用套件已编写，验证真实 revision 竞争、并发签发、重复确认不恢复旧头像及删除固定壁纸的原子性。它要求显式 `TEST_DATABASE_URL` 与 `DATABASE_URL`，通过现有隔离门禁才构造 PrismaClient；fixture 只清理本次创建的 ID。尚未运行此套件，不宣称真实 PostgreSQL 行锁行为已经验收。

## 浏览器验收

使用本机无头 Edge、Playwright，在 1440×900 与 390×844 运行真实 App；所有应用 API 和图片/直传目标均被模拟，未知外部请求被阻断。不读取用户数据库、使用用户 Cookie 或向 OSS 写入。

| 验收项 | 两个视口结果 |
| --- | --- |
| 40 字名称保存、头像文件预览与确认 | 通过；上传请求不携带应用 Authorization/Cookie，完成后使用确认返回的头像 |
| 满 20 张图库与系统素材 | 通过；菜单可滚动，头像/缩略图实际解码，页面无水平溢出；已检查桌面及手机截图 |
| 固定个人壁纸后刷新 | 通过；固定 assetId 和选中状态恢复 |
| 删除当前固定个人壁纸 | 通过；图库变为 19 张，模式恢复随机 |
| 菜单内键盘 Escape | 通过；菜单关闭并恢复触发入口焦点 |
| 浏览器运行异常 | 未记录 pageerror |

可重复脚本：[verify-profile-media-browser.cjs](../client/test/verify-profile-media-browser.cjs)。先在 `client/` 启动 Vite，脚本只接受 `http://127.0.0.1:<port>`。当前开发服务为 `http://127.0.0.1:5189`。Playwright 仅用于本机验收，不加入生产或客户端包；可通过 `PLAYWRIGHT_MODULE` 指向已有安装，`BROWSER_EXECUTABLE` 指定浏览器。本机已运行并退出码 0：

```powershell
$env:PLAYWRIGHT_MODULE = "$PWD/.superpowers/profile-media/browser/node_modules/playwright"
node client/test/verify-profile-media-browser.cjs http://127.0.0.1:5189
```

截图输出到忽略版本控制的 `.superpowers/profile-media/screenshots/`。此脚本证明前端契约与交互，不证明云端签名、私有 ACL、真实 CORS 或跨设备持久化。

## 依赖审计

用户授权后执行 npm 官方只读审计，未运行 `audit fix`。本次新增的 `sharp 0.34.x` 被报告存在底层图片库漏洞，已升级到 `0.35.5` 并重新验证真实图片解码。依据维护者发布的 [libheif 安全公告](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c)和 [libvips 安全公告](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj)。

最终审计仍报告 64 项告警：3 low、18 moderate、40 high、3 critical。`ali-oss` 与 `sharp` 无直接告警；与原始 lockfile 比对，本次新增依赖路径无受影响项。既有依赖风险未在本轮扩展升级，不将整体审计称为通过。

## 本机部署

2026-10-04，用户自行配置私有 Bucket `booksoul-profile-fun`（杭州）、RAM 策略、OSS 跨域规则及服务端凭据。配置完整性已只读检查；尚未通过真实云请求验证凭据、策略或 OSS CORS。

用户明确授权暂停后端、备份、部署指定迁移、重新生成 Prisma、追加后端 CORS 来源并重启。实际目标为 `127.0.0.1:5432 / booksoul / public`，部署前确认唯一待部署迁移为 `20261004100000_user_profile_media`，没有未完成的迁移记录。历史迁移校验差异仅来自 CRLF/LF，未修改历史 SQL。

- 完整数据库 custom 格式备份保存在 Git 忽略的 `.superpowers/profile-media/backups/`，目录权限限制为当前用户与 SYSTEM。备份大小 67,160,599 字节；`pg_restore --list` 成功，包含用户和迁移表数据。未执行恢复演练，不能据此声称恢复已验证。
- 指定迁移部署成功，数据库记录的校验和与本地 SQL 一致。用户 3、书籍 4、阅读位置 3，与部署前相同；私人图片记录为 0，3 个账号均为默认 RANDOM、revision 0、未设置头像和固定壁纸。
- 停止本项目后端后，完整 Prisma 生成成功，Windows DLL 占用已解除；随后服务端 `npm run build` 成功，后端按 `start:dev` 模式重新启动。
- 真实 `server/.env` 只追加 `http://127.0.0.1:5189` 到原有 `CORS_ORIGINS`；未修改凭据或其他配置。前端恢复在同一地址运行。
- 无认证连通检查通过：前端首页 200、直连资料接口与前端代理均为 401；OPTIONS 预检为 204，直连与预检响应均允许来源 `http://127.0.0.1:5189`。这证明接口启动、认证边界和后端 CORS，不等同于登录后的资料保存或真实 OSS 联调验收。

备份、迁移及连通检查的本机记录保存在 Git 忽略的 `.superpowers/profile-media/`；不提交备份、启动日志或凭据。

## 未执行项

- 未上传真实文件或删除真实 OSS 对象，云端签名、权限、私有读取和 OSS CORS 仍需按方案 A1–A13 验证；自动执行外部写操作须另行授权。
- 未运行专用 DB 并发测试，仍需符合隔离门禁的独立测试库；未运行小说索引 E2E，不使用实际用户数据替代测试 fixture。
- 未恢复备份演练、未启用定期清理、未扩展修复既有依赖审计告警。

改动仅涉及用户资料、私人图片、外观接入、相邻测试与文档，以及本次明确授权的本机部署和 CORS 配置；小说上传、RAG、阅读器和认证协议保持不变。未创建分支、提交或 push。
