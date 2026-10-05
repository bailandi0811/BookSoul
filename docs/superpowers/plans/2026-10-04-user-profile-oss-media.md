# 用户资料与 OSS 头像壁纸开发文档

> 执行者逐项实施并记录验证结果；可使用 superpowers:executing-plans 或 superpowers:subagent-driven-development。本文交付的是设计与实施计划，复选框均表示后续开发工作，未表示功能已实现。不得自行提交、创建分支或修改本任务之外的文件。

**Goal:** 登录用户可以修改自己的名称、上传和更换头像、维护自己的壁纸，并选择随机或固定壁纸，默认随机。

**Architecture:** 沿用账号页、Zustand 和 NestJS 用户业务目录。服务端签发仅允许指定对象的 OSS PostObject 表单，浏览器直传私有临时对象；服务端验证和规范化图片后保存正式对象，再提交数据库引用。系统壁纸继续使用现有本地资源，用户壁纸按 owner 隔离。

**Tech Stack:** 现有 React 19、TypeScript、Zustand、NestJS 11、Prisma、PostgreSQL、Vitest、Jest；建议仅服务端新增 `ali-oss` 和 `sharp`，安装前按仓库规则取得依赖确认。

**Spec:** 本文“设计契约”是实施事实源，后续任务按该契约执行。

## 任务边界

- **Done:** 名称、头像、个人壁纸和壁纸模式在刷新、重新登录及另一设备读取时保持一致；随机不因切页改变；固定不因刷新改变；跨用户请求被拒绝；失败保留已保存资料。
- **Scope:** 本文列出的用户资料、图片存储、外观状态及相邻测试；既有未提交改动必须保留，实施前重新读取相关 diff。
- **非目标:** 代其他用户编辑资料、管理员能力、公开图库、头像历史、裁剪编辑器、书籍封面、小说源文件 OSS 化、阅读器排版调整。
- **Risks:** OSS 真实上传和存储产生费用；图片规范化消耗服务端带宽与 CPU；数据库新增迁移；短时读取链接属于敏感访问凭证。真实配置、迁移部署和外部写验收分别确认，不包含在文档交付中。
- **产品默认值:** 随机候选包含系统图片和当前用户已完成上传的壁纸；每人最多保存 20 张个人壁纸。这两项是本方案明确选定的默认值，后续如调整须同步契约及测试。

## 现有实现与参考

调查基线为 2026-10-04 的当前工作区，包含正在进行的阅读器与界面改动。执行前重新核对文件，本文不要求覆盖这些改动。

| 事实源 | 当前行为及实施影响 |
| --- | --- |
| [User schema](../../../server/prisma/schema.prisma) | 已有 `User.name`，暂无账号头像及壁纸字段；名称直接复用，新增媒体数据需新迁移。 |
| [UsersService](../../../server/src/users/users.service.ts) | `PublicUser` 和 `toPublicUser` 同步返回身份资料；保持现有认证响应契约，不往登录和 JWT 流程加入 OSS 调用。 |
| [账号页](../../../client/src/components/auth/AccountPage.tsx) | 已有个人信息与“背景与主题”入口；名称和头像编辑放在这里。 |
| [认证状态](../../../client/src/store/useAuthStore.ts) | 已有 `updateCurrentUser`、`authGeneration`；用于资料更新与陈旧响应隔离。 |
| [外观状态](../../../client/src/store/useAppearanceStore.ts) | `BACKGROUNDS` 有 7 张系统图片及 `none`；当前进入页面随机、切页保留。`none` 是纯色选项，不加入随机图片候选。 |
| [背景组件](../../../client/src/components/ScenicBackground.tsx) | 有图片预加载、失败提示、亮暗主题处理；接入个人壁纸时保留这些行为。 |
| [API 客户端](../../../client/src/lib/api.ts) | `apiFetch` 自动带身份并协调刷新；仅用于应用 API，不能用于 OSS 地址。 |

Summer 参考文件为 `D:/summer-checkin/src/lib/oss.ts`、`src/app/api/oss/presign/route.ts`、`src/app/api/user/avatar/route.ts`、`src/components/profile/avatar-picker.tsx`。其实际流程是短时预签名 PUT、浏览器上传、服务端校验对象后写资料；用途区分头像与壁纸。引用这些设计边界，不复制其 Next.js 路由、公开图片地址、内存配额或静默吞错逻辑。本文完整定义契约，执行者无需读取 Summer 才能实施。

## 设计契约

### 用户行为

1. 名称只修改当前登录用户的 `User.name`。先 trim，长度 1 至 50 个 Unicode 码点，与现有注册名称长度一致；拒绝控制字符。名称不要求唯一，不修改邮箱、密码、角色或认证版本。
2. 头像默认继续显示名称首字或现有图标；上传成功后显示图片。更换失败保持旧头像；“恢复默认”清除引用，旧头像进入待清理状态。
3. 系统壁纸列表和文件原样保留。个人壁纸每次上传新增一张，只有 `READY` 图片进入本人图库；不覆盖系统文件。图库支持删除自己的图片，以便管理数量上限。
4. 随机为账号默认模式。每次刷新、重新打开应用或成功切换登录身份时，从系统图片与本人 `READY` 壁纸中等概率选一张；候选超过一张时排除上一张。上一张仅存为按账号隔离的本机标识，不保存签名 URL。
5. 站内切页、聊天流式更新、打开背景菜单、刷新读取 URL、上传新壁纸、重新渲染均不触发随机。手动从固定切回随机时重新抽取一次。
6. 固定模式可以选择系统壁纸、个人壁纸或纯色 `none`。点击图片即保存 `FIXED` 与目标；刷新及重新登录继续选中。切回随机清除固定目标。
7. 上传新壁纸只加入图库，不自动把随机改成固定，也不替换当前固定目标。用户可随后选择新图片。
8. 删除当前固定的个人壁纸时，同一数据库事务切回随机并清除目标；客户端完成删除后重新抽取。随机模式删除正在显示的个人壁纸时也重新抽取。
9. 亮暗主题继续使用现有本机偏好，和随机/固定模式独立。访客仅能使用系统壁纸，默认随机；其随机/固定选择可以保存在本机，不上传图片、不进入账号图库。
10. 登录资料尚未加载时，不展示上一个账号图片；固定偏好确定前展示纯色加载状态，避免误闪随机图片。加载失败显示可重试提示，不静默覆盖服务端选择。

### 数据模型

在 `User` 新增下列字段，不改已有字段、表或迁移：

| 字段 | 类型及默认值 | 含义 |
| --- | --- | --- |
| `avatarAssetId` | `String?`，null | 当前头像资源 ID；读取与写入都必须按 owner 校验。 |
| `wallpaperMode` | `WallpaperMode`，`RANDOM` | 枚举 `RANDOM / FIXED`。 |
| `fixedWallpaperKind` | `WallpaperKind?`，null | 枚举 `SYSTEM / USER`。 |
| `fixedWallpaperId` | `String?`，null | 系统 ID（含 `none`）或个人资源 ID。 |
| `profileRevision` | `Int`，0 | 名称、头像引用、图库或壁纸偏好变化时递增，防多端陈旧写入。 |

新增 `UserMediaAsset`，同时承担上传凭证记录和媒体资源记录：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id / ownerId` | UUID String / String | 服务端生成 ID，owner 来自认证上下文；owner 外键 RESTRICT 关联 User，保留待清理对象的归属。 |
| `purpose` | `AVATAR / WALLPAPER` | 用途必须来自 allowlist。 |
| `status` | `PENDING / READY / RETIRED / REJECTED / DELETED` | 上传、可使用、已移除、校验拒绝、物理清理完成。 |
| `uploadKey / objectKey` | unique String / unique String | 签发时分别预分配临时路径与正式路径。 |
| `declaredMime / declaredBytes` | String / Int | 签发时验证过的输入声明；仍需验证实际对象。 |
| `width / height / storedBytes` | Int? | 正式图片规格，READY 时必填。 |
| `uploadExpiresAt / commitExpiresAt` | DateTime | 上传签名 5 分钟，提交窗口 30 分钟，均由服务器时钟决定。 |
| `createdAt / updatedAt / retiredAt` | DateTime / DateTime / DateTime? | 持久配额、审计与清理依据。 |
| `stagingCleanedAt` | DateTime? | 已完成暂存图清理的时间，避免 READY 记录重复占用清理批次。 |

索引：`(ownerId, purpose, status)`、`(ownerId, createdAt)`、`(status, commitExpiresAt)`。迁移增加约束：RANDOM 的固定字段均为空；FIXED 两个固定字段均非空；revision 非负。既有用户默认随机、默认头像、无个人图库，无数据回填或覆盖。头像 ID 可为空外键关联资源；资源属于该用户必须额外通过 `where: { id, ownerId, purpose, status }` 证明，不能仅依赖外键。

不使用现有 `UserProfileRecord`，它属于会话记忆数据，不是账号外观资料。

### OSS 上传与读取

采用 Summer 的“签发、直传、确认”三阶段思想，具体选择 **PostObject 表单直传**。它可在 policy 中约束精确 key 与文件大小，浏览器无需 OSS SDK；官方说明见 [OSS 客户端直传](https://www.alibabacloud.com/help/en/oss/user-guide/uploading-objects-to-oss-directly-from-clients/) 和 [PostObject](https://www.alibabacloud.com/help/zh/oss/developer-reference/postobject)。普通文件内容声明不能代替服务端图片验证。

| 项目 | 固定规则 |
| --- | --- |
| 上传格式 | JPEG、PNG、静态 WebP；拒绝 GIF、SVG、动画 WebP、HTML 和未知格式。 |
| 大小 | 头像 1 至 5 MiB；壁纸 1 至 10 MiB；签名绑定声明的精确字节数，且不超过用途上限。 |
| 像素 | 输入最大 24,000,000 像素，最长边 8,192；非零宽高；拒绝多帧。 |
| 正式头像 | 自动矫正方向，中心裁剪为 512 × 512，输出 WebP quality 85。 |
| 正式壁纸 | 保持比例，不放大，最长边不超过 3,840，输出 WebP quality 85。 |
| 图片元数据 | 正式图剥离 EXIF、GPS 等元数据；不调用保留元数据选项。 |
| 临时 key | `booksoul/profile/staging/{ownerId}/{assetId}.{serverChosenExt}`。 |
| 正式 key | `booksoul/profile/assets/{ownerId}/{purpose}/{assetId}.webp`。 |
| 读取 | 私有 Bucket，READY 资源按 owner 查询后签发 15 分钟 GET URL，响应包含到期时间；不返回永久公开 URL。 |
| 配额 | 同一账号头像和壁纸合计 10 次签发/滚动分钟、30 次签发/滚动 24 小时；壁纸 READY + 未过期 PENDING 最多 20，头像未过期 PENDING 最多 3。 |
| 执行限额 | OSS 单次请求超时 10 秒，整个确认最多 60 秒，每进程同时规范化最多 2 张，等待名额最多 5 秒，原生图片处理超时 10 秒；确认 HTTP 调用客户端最多 90 秒。 |

policy 精确绑定 key、Content-Type、private ACL、`success_action_status=204` 和禁止覆盖标识 `x-oss-forbid-overwrite=true`；签名表单字段原样返回，不手写 SDK 私有签名算法。客户端 MIME 及扩展名只用于早期提示，后端根据允许 MIME 选扩展名，不采用原始文件名。

确认步骤：按 owner 查 PENDING → 检查有效期 → HEAD 验证实际大小/MIME → 有上限地 GET 原图 → 解码确认真实格式、帧数、像素及完整性 → 方向矫正与重编码 → 写预分配的私有正式 key → 数据库事务内锁定当前 User、重新读取资源状态及 revision → 标记 READY 并更新资料。图片 GET 必须使用字节数上限并可取消，不能先无限制读入 Buffer；图像处理需要实际输出成功，不能只检查 metadata。`sharp` 的像素限制与默认输出元数据行为见 [constructor](https://sharp.pixelplumbing.com/api-constructor/) 与 [output](https://sharp.pixelplumbing.com/api-output/)。

临时对象禁止覆盖；正式 key 永不签发浏览器写权限，处理相同临时对象重复生成时使用相同转换参数。外部 IO 不放在数据库行锁事务内。若文件验证或数据库提交失败，旧引用保持不变；正式对象仍可由该资源记录追踪和回收。成功提交后即使删除临时对象失败也不回滚资料，保留记录供清理。

使用 `sharp.timeout({seconds:10})` 限制原生处理；取消/总超时后不继续写 OSS 或提交资料，只有底层处理实际结束后才释放并发名额，不能只用 Promise.race 提前释放。等待并发名额超过 5 秒返回 503 `MEDIA_PROCESSING_BUSY`，不建立无界等待队列。

### 接口与并发

控制器前缀 `api/users/me`，全部使用 `JwtAuthGuard` 与现有 `@CurrentAuth()`（`server/src/auth/decorators/auth-context.decorator.ts`），只接受 AuthContext 的 `kind=user`。禁止 body、query 或路由参数指定 owner；未知字段由现有 ValidationPipe 拒绝。成功响应沿用 `{ success: true, data }`，下表展示 data。

```ts
type MediaPurpose = "AVATAR" | "WALLPAPER";
type WallpaperSelection =
  | { mode: "RANDOM" }
  | { mode: "FIXED"; kind: "SYSTEM" | "USER"; id: string };
type ReadableMedia = {
  id: string; url: string | null; expiresAt: string | null;
  width: number; height: number;
};
type ProfileSnapshot = {
  user: PublicUser; // 服务端使用现有类型，客户端对应 AuthUser
  revision: number;
  avatar: ReadableMedia | null;
  wallpapers: ReadableMedia[];
  wallpaper: WallpaperSelection;
  mediaUploadsAvailable: boolean;
  mediaReadError: "MEDIA_STORAGE_UNAVAILABLE" | null;
};
type UploadTicket = {
  assetId: string; uploadExpiresAt: string; commitExpiresAt: string;
  upload: { method: "POST"; url: string; fields: Record<string, string> };
};
```

| 方法与路径 | 请求 | data 与行为 |
| --- | --- | --- |
| `GET /profile` | 无 | ProfileSnapshot；头像仅当前引用，壁纸仅本人 READY；响应 `Cache-Control: no-store`。 |
| `PATCH /profile` | `{ name?, resetAvatar?: true, wallpaper?, expectedRevision }` | ProfileSnapshot；至少一项实际编辑，原子更新提供字段，未提供字段不变；resetAvatar 与名称、壁纸可共同保存。 |
| `POST /media/uploads` | `{ purpose, contentType, byteSize }` | UploadTicket；先在短数据库事务中按 owner 锁 User、检查持久配额并建立 PENDING；不改变 revision。 |
| `POST /media/uploads/:assetId/commit` | `{ expectedRevision }` | `{ profile: ProfileSnapshot, alreadyCommitted: boolean }`；头像首次提交替换旧引用并 RETIRE 旧头像；壁纸首次提交加入图库，不改壁纸模式。 |
| `DELETE /wallpapers/:assetId` | `{ expectedRevision }` | ProfileSnapshot；仅当前 owner 的 READY WALLPAPER 可删，逻辑移除并 RETIRE；当前固定项删除时回到 RANDOM。 |

同一 User 的配额、资料写入和逻辑移除均用参数化 `SELECT ... FOR UPDATE`，可复用现有 `lockAuthUser(tx, userId)`，不修改该工具。写入带 revision，版本不符返回 409；外部验证后进入提交事务必须重新检查。头像恢复默认和被替换头像都进入 RETIRED，不继续对外签发读取 URL。

同一 asset 再次 commit 若已经成功（READY 或曾成功后 RETIRED），返回当前资料与 `alreadyCommitted=true`，不递增 revision、不重新切换头像、不恢复已删除壁纸；DELETED/REJECTED 返回不可提交错误。原请求成功但响应丢失时允许用户重试相同 assetId；冲突后先重新 GET，保留本地选择，要求再次保存，不自动覆盖另一端修改。

| HTTP 状态与 code | 触发与客户端行为 |
| --- | --- |
| 400 `PROFILE_INPUT_INVALID` | 空名称、超长、非法用途/MIME/选择、未知字段；表单展示错误。 |
| 401 | 无有效登录身份；沿用现有认证刷新，身份变化则停止流程。 |
| 404 `MEDIA_NOT_FOUND` | ID 不存在或不属于本人，统一响应，避免探测其他用户。 |
| 409 `PROFILE_REVISION_CONFLICT` | 陈旧资料写入；重新加载并显式重试。 |
| 409 `MEDIA_NOT_UPLOADED` | OSS 对象不存在；保留本地预览，提示重新上传。 |
| 410 `MEDIA_UPLOAD_EXPIRED` | 提交窗口过期；重新签发新 ticket，不沿用旧签名。 |
| 413 `MEDIA_TOO_LARGE` | 实际对象超过上限；旧资料保持不变。 |
| 422 `MEDIA_INVALID_IMAGE` | MIME 与真实格式不符、损坏、动画、像素超限；拒绝入库使用。 |
| 429 `MEDIA_RATE_LIMITED / WALLPAPER_LIMIT_REACHED` | 配额或图库上限；提示等待或移除旧壁纸。 |
| 503 `MEDIA_STORAGE_UNAVAILABLE` | 未配置或 OSS 网络/鉴权故障；明确报告，不伪装对象不存在。 |
| 503 `MEDIA_PROCESSING_BUSY` | 图片处理名额等待超时；提示稍后重试，不自动无限重试。 |

资料快照始终保留数据库中合法资源的 ID 与规格。若无法生成读取签名，相关 `url/expiresAt` 返回 null 并设置 `mediaReadError`；界面展示占位与重试，名称和系统壁纸保存仍返回成功快照。实际图片 GET 失败由图片组件提示。数据库写入已经成功时，不能因随后签名失败把保存报告成失败；上传/确认阶段的存储故障仍按表返回 503。`mediaUploadsAvailable` 表示配置已完整，不代表每次网络请求保证成功。

### 前后端接入边界

在 `server/src/users/profile/` 新增 `UserProfileModule`，导入现有 `UsersModule`、`AuthModule`；仅在 AppModule 注册该模块。现有 AuthModule 已依赖 UsersModule，因此不要反过来让 UsersModule 导入 AuthModule 形成循环。业务仍在 users 目录，`UsersService`、JWT、登录/刷新契约无需增加 OSS 依赖。

客户端新增 `useUserProfileStore`，资料仅存内存，绑定 `{userId, authGeneration}`；所有读写响应还需按 request sequence / revision 排除过期结果。登录及会话恢复完成后加载，退出、身份失效、切换身份同步清空并取消请求，不能等下一次渲染才隐藏旧私人图。已加载的 profile 名称作为展示事实源，保存成功再调用 `updateCurrentUser`；旧认证刷新响应不能覆盖 profile 中较新的名称。

OSS POST 使用独立 XHR，以便提供进度和 abort；`withCredentials=false`，不加应用 Authorization/Cookie，不调用 `apiFetch/apiUpload`，也不手工设置 multipart Content-Type。FormData 按服务端字段添加，file 放最后。应用 API 继续使用 `apiFetch` 和现有结构化解析方式。上传中状态区分签发、上传百分比、验证、保存成功；本地预览 Object URL 在换图、取消、成功及卸载时回收。

头像组件同时用于账号页和顶栏账号入口，图片加载失败回到首字占位并提供重试；头像更新不影响导航。壁纸菜单增加随机/固定模式、本人缩略图、上传和移除入口，保留现有系统图片及主题控件。纯色是可固定目标，不作为个人上传图片。

外观 store 使用显式选择类型，避免对 `BACKGROUNDS.find(...)!` 假设个人图片也存在于系统列表。固定个人图通过稳定 assetId 解析 URL；刷新 URL 只更新 src，不重新选图或重置动画。读取 URL 在到期前 60 秒且页面可见时统一刷新；后台页恢复可见时先检查到期时间；失败保留选择 ID并显示重试，不进行无界请求循环。私人图片使用 `referrerPolicy="no-referrer"`，不持久化签名 URL。

### 配置与清理

建议配置 `OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、可选 `OSS_ENDPOINT`，不用 `OSS_PUBLIC_BASE_URL`。endpoint 只取受信配置，生产要求 HTTPS，不能由请求输入。OSS 完全未配置时应用仍可运行，个人资料和系统壁纸可用，上传入口不可用；已有媒体而存储故障时提示读取失败，不能把已保存引用当作不存在。

实施阶段先说明新增配置的具体内容，再确认对 `server/.env.example`、配置校验的编辑。真实 `.env`、RAM、Bucket ACL/CORS 和生命周期规则另行确认；本次文档不修改这些配置。后端专用 RAM 身份仅访问 `booksoul/profile/` 前缀；Bucket 私有，CORS 限制实际前端来源，POST/GET/HEAD 及所需签名字段；不使用 `*` 来源、不开放永久公开读、不复用 Summer 凭据。

清理通过用户业务目录的独立服务和专用 CLI 实施，默认 dry-run，不接入小说 ingestion worker。PENDING 超过 commitExpiresAt 24 小时、REJECTED 超过 updatedAt 24 小时、RETIRED 超过 retiredAt 24 小时才可清理；READY 正式对象保留。按资源记录枚举精确 key，禁止扫描/清空整个 Bucket。每批至多 100 条，单对象删除幂等；再次按 owner、状态和引用检查后执行，临时和正式对象均清理成功后才标记 DELETED，失败保留可重试记录并报告计数。清理临时上传时须保留最近 24 小时的签发记录，以维持配额统计。

清理 READY 资源遗留临时对象时，必须晚于 uploadExpiresAt，避免有效签名重新生成已删除对象；正式图和 READY 状态均保留。头像更换/壁纸删除是逻辑移除，旧短时 URL 可能在最多 15 分钟内仍有效，24 小时后由获授权的清理任务回收对象。应用不宣称物理删除已立即完成。

外部数据流为用户主动选择的图片到指定 OSS Bucket；服务端再读取原图做验证、保存去元数据的正式图，不发送给模型、向量库或第三方图像服务。原图和未使用对象按上述清理策略保留；正式图保留到替换/移除及清理。费用包括存储、请求和流量，不在文档中给出未经核对的固定价格；生产必须安排获授权的定期清理，否则不能宣称保留期限已落实。

## 全局执行约束

- 只编辑各任务列出的文件；默认单元测试 Mock Prisma/OSS，不得加载 `.env` 或连接真实服务；任务 6 的专用 DB 测试单独走隔离门禁。
- Node 22.19.x、npm 10，新增依赖同步服务端 package.json 与 package-lock.json，客户端不加 OSS SDK。
- 本次工作区已有阅读器、App、外观 CSS、schema、README 等未提交改动，先读差异再增量编辑；不重排整文件、不覆盖、不提交。
- `ali-oss` 用于官方签名及对象操作，`sharp` 用于安全解码和规范化，含原生平台产物；安装前说明用途、版本兼容和维护影响并确认。不得以未验证的扩展名/HEAD 或自行编写解码器作为替代。
- 数据库新增迁移可写文件和只读审查，实际部署需核对目标与备份；禁止 `migrate reset`、`db push` 或自动运行 `migrate dev` 对真实库写入。
- 日志仅包含内部关联 ID、用途、阶段、稳定错误码、耗时和计数；不打印 OSS URL/表单签名、密钥、Cookie、完整 owner、原始文件或客户端原文件名。

## 重点回归条件

| 条件 | 预期 | 所属任务 |
| --- | --- | --- |
| 用户 A 的请求在退出再登录 B 或重新登录 A 后才返回 | userId 与 generation/sequence 同时检查，不能更新新会话。 | 任务 4 |
| 图片真实格式和声明不同或小文件包含巨大像素/动画 | 解码后拒绝，旧资料不变。 | 任务 3 |
| commit 成功后响应丢失、重复提交或并发保存另一张头像 | 不重复 revision、不恢复旧头像，陈旧写返回 409。 | 任务 2、3、6 |
| 固定个人图过期、删除、刷新页面或系统候选为单项 | 不因 URL 刷新随机；删除切随机；单候选不空集合。 | 任务 4、5 |
| 清理期间刚完成上传、正式对象已写但事务失败、OSS 删除失败 | 保留使用中对象、可追踪孤儿对象、明确失败且可重试。 | 任务 3、6 |

## 实施任务

任务按依赖顺序执行，每项包含可审查的独立产出。“可独立执行”表示新执行者仅凭本文、指定输入任务与仓库就能完成和验证该项，不表示尚未建立的数据或接口可以跳过。

### 任务 1 数据模型与策略

**依赖:** 无；新依赖与配置安装不是本任务条件。

**文件:** 修改 `server/prisma/schema.prisma`；新增 `server/prisma/migrations/20261004100000_user_profile_media/migration.sql`、`server/src/users/profile/profile.types.ts`、`profile.policy.ts`、`profile.policy.spec.ts`、`profile-media.storage.ts`。若迁移名已有占用，改用新的时间戳，不覆盖文件。

**接口:** `normalizeProfileName(value: unknown): string`、`assertMediaInput(purpose: unknown, contentType: unknown, byteSize: unknown): ValidMediaInput`；`ValidMediaInput` 包含 `purpose, contentType, byteSize, extension`。服务端系统 ID allowlist 为 `none,mountains,city,anime,dunes,rain-city,anime-town,coast`，与当前 BACKGROUNDS 对齐。

本任务也建立存储 abstract class 注入 token `ProfileMediaStorage` 与 `ObjectMeta`，方法签名按任务 3 的接口块定义，只写契约，无网络实现。ProfileSnapshot 的 server 类型引用现有 PublicUser，client 单独使用结构等价的 AuthUser，不跨包导入 NestJS 类型。

- [ ] 写策略测试：trim 后为空拒绝、50 码点通过/51 拒绝、控制字符拒绝；头像 5 MiB/壁纸 10 MiB 边界通过，0/超限拒绝，非整数和未知 MIME 拒绝，固定模式目标互斥。
- [ ] 在 server 运行 `npm test -- --runInBand src/users/profile/profile.policy.spec.ts`，记录失败原因应为尚未实现策略。
- [ ] 实现上述模型、类型和纯策略；手写扩展型 migration，保留现有阅读位置字段及迁移。UserMediaAsset 的 status、purpose 与前述契约使用 Prisma enum。
- [ ] 重新运行策略测试，预期全部通过。只读核查 SQL 无 UPDATE/DELETE/DROP，新增默认值与 CHECK 一致；在已有环境满足 schema 解析条件时执行 `npx --no-install prisma validate` 和 `npm run prisma:generate`，不修改 `.env`、不执行迁移部署。

**产出:** 可生成客户端的数据模型、输入策略和明确的默认值；没有真实库写入。

### 任务 2 资料接口与壁纸偏好

**依赖:** 任务 1；媒体存储 provider 在测试中用 mock，无需真实 OSS。

**文件:** 新增 `server/src/users/profile/user-profile.module.ts`、`user-profile.controller.ts`、`user-profile.service.ts`、`unconfigured-profile-media.storage.ts` 及相邻 `*.spec.ts`；新增 `dto/update-profile.dto.ts`、`dto/create-media-upload.dto.ts`、`dto/commit-media-upload.dto.ts`、`dto/delete-wallpaper.dto.ts`；修改 `server/src/app.module.ts` 仅注册模块。

**接口:** `getProfile(ownerId: string): Promise<ProfileSnapshot>`、`updateProfile(ownerId: string, dto: UpdateProfileDto): Promise<ProfileSnapshot>`、`deleteWallpaper(ownerId: string, assetId: string, expectedRevision: number): Promise<ProfileSnapshot>`。存储使用任务 1 的 `ProfileMediaStorage` token，测试提供 fake；未配置 provider 所有对象方法抛明确的存储未配置异常，不做网络调用；资料快照按前述规则呈现可用部分。

- [ ] 写测试：owner 来自 AuthContext；访客拒绝，伪造 userId/未知字段返回 400；未提供字段不变；revision 冲突不写；固定他人资源/非 READY/非 WALLPAPER 均拒绝。
- [ ] 补测试：删除当前固定壁纸原子回 RANDOM；清除头像 RETIRE 旧图；只有成功变化递增一次 revision；OSS 未配置仍能修改名称与选择系统图，已有个人图签名故障仍保留 ID 并返回 mediaReadError，名称保存仍成功。
- [ ] 运行 `npm test -- --runInBand src/users/profile/user-profile.controller.spec.ts src/users/profile/user-profile.service.spec.ts`，记录预期失败；实现路由、DTO、事务与注入关系。
- [ ] 重新运行上述测试，预期全通过；controller 测试至少有用实际 ValidationPipe/Guard 边界的请求检查，不仅直接调用方法。确认没有 UsersModule/AuthModule 循环。

**产出:** 名称与壁纸偏好服务契约可用，资料读取依赖可替换存储边界，不改变既有认证 API。

### 任务 3 OSS 直传与图片确认

**依赖:** 任务 1、2；生产依赖安装和新增配置编辑须完成前述确认。

**文件:** 新增 `server/src/users/profile/oss-profile-media.storage.ts`、`profile-image.service.ts`、`profile-media.service.ts` 及相邻 `*.spec.ts`；新增 `server/src/config/profile-media.config.ts` 及测试；修改任务 2 的 module/controller 完成媒体路由和配置条件下的 provider 选择；获确认后修改 `server/package.json`、`server/package-lock.json`、`server/.env.example`、`server/src/config/env.validation.ts`。

**接口:** `ProfileMediaStorage` 定义 `createUpload(key, mime, bytes, expiresAt): Promise<UploadTicket['upload']>`、`head(key): Promise<ObjectMeta | null>`、`readBounded(key, maxBytes, signal): Promise<Buffer>`、`putPrivate(key, bytes, mime, signal): Promise<void>`、`signRead(key, expiresSeconds): Promise<string>`、`delete(key): Promise<void>`。`ObjectMeta` 包含实际 `byteSize/contentType`；只有 OSS 确定的不存在返回 null，其他错误向上传播为稳定错误。

**服务接口:** `normalizeImage(input: Buffer, purpose: MediaPurpose, signal: AbortSignal): Promise<{ bytes: Buffer; width: number; height: number }>`；`createUpload(ownerId: string, input: ValidMediaInput): Promise<UploadTicket>`；`commit(ownerId: string, assetId: string, expectedRevision: number): Promise<{ profile: ProfileSnapshot; alreadyCommitted: boolean }>`。

- [ ] 用 fake clock、Mock OSS 和有真实字节的微型图片 fixture 写测试：policy 精确 key/字节数/private/禁止覆盖/5 分钟；两用途限额、owner 配额累计、当前图库满拒绝。
- [ ] 写确认拒绝测试：不存在、跨用户 ID、过期、HEAD 大小/MIME 不符、有界读取中超限、真实格式伪装、截断图片、动画及超像素；这些情况不更新用户引用。PNG/JPEG/WebP 合法输入规范化结果可解码、尺寸正确、无 EXIF；全流程超时能取消 IO并释放规范化名额。
- [ ] 写一致性测试：重复 commit 不再替换；旧头像被替换后的重复请求不恢复旧图；PUT 正式图成功但 DB 失败保留可追踪 PENDING；校验通过后 revision 已变则拒绝更新。
- [ ] 运行 `npm test -- --runInBand src/users/profile/oss-profile-media.storage.spec.ts src/users/profile/profile-image.service.spec.ts src/users/profile/profile-media.service.spec.ts src/config/profile-media.config.spec.ts`，先记录失败，再实现最小 adapter 与确认流程，重新运行至通过。

**产出:** Mock 外部服务下可独立验证的完整直传后端；正式图片只在确认后可使用，真实 CORS/OSS 签名留给任务 7。

### 任务 4 客户端资料与外观状态

**依赖:** 任务 2、3 的接口；客户端测试使用模拟响应。

**文件:** 新增 `client/src/lib/user-profile-api.ts`、`user-profile-api.test.ts`、`wallpaper-selection.ts`、`wallpaper-selection.test.ts`、`client/src/store/useUserProfileStore.ts` 及测试；新增 `client/src/components/auth/useUserProfileSync.ts` 及测试；增量修改 `client/src/store/useAppearanceStore.ts`、`client/src/App.tsx` 及直接相关测试。

**接口:** API 暴露 `fetchProfile(signal?)`、`updateProfile(input, signal?)`、`createMediaUpload(input, signal?)`、`uploadDirect(ticket, file, {signal,onProgress})`、`commitMediaUpload(assetId, revision, signal?)`、`deleteWallpaper(assetId, revision, signal?)`，返回前述类型；所有外部 JSON 先作为 unknown 验证。纯函数 `chooseRandomWallpaper(candidates: WallpaperRef[], previous: WallpaperRef | null, random: () => number): WallpaperRef | null`，`WallpaperRef={kind:'SYSTEM'|'USER',id:string}`；空集返回 null 由调用方显示纯色，单项直接返回该项。

- [ ] 写 API 测试：应用 API 带身份；OSS 不带 Cookie/Authorization，字段一致且 file 最后；进度和 abort 有效；OSS 403 不触发应用令牌刷新；签发/直传失败不 commit；commit 响应丢失允许重试原 ID。
- [ ] 写状态测试：延迟 A 响应在 B 登录后丢弃，同一 A 重新登录的旧 generation 也丢弃；退出同步清空和取消；陈旧 GET 不覆盖更高 revision；旧认证刷新不会把最新显示名称还原。
- [ ] 写随机测试：候选为系统 + 本人 READY，无他人/纯色；单项不空、多项避免重复；首次默认 RANDOM，FIXED 跨刷新恢复；切页、URL 刷新、图库新增不重抽，删除当前图片或模式回随机只抽一次。
- [ ] 运行 `npm test -- src/lib/user-profile-api.test.ts src/lib/wallpaper-selection.test.ts src/store/useUserProfileStore.test.ts src/components/auth/useUserProfileSync.test.ts`，记录失败，完成 API/store/sync 后重复至通过。localStorage 写入失败时当前页仍可选择，无签名 URL 持久化。

**产出:** 稳定的资料加载、上传流程、身份隔离和随机/固定选择，可用模拟接口独立验收。

### 任务 5 账号编辑与壁纸图库界面

**依赖:** 任务 4。

**文件:** 新增 `client/src/components/auth/AccountProfileForm.tsx`、`ProfileAvatar.tsx`、`client/src/components/UserMediaUpload.tsx`、`WallpaperLibrary.tsx` 及相邻测试；增量修改 `client/src/components/auth/AccountPage.tsx`、`AccountSection.tsx`、`client/src/components/AppHeader.tsx`、`ScenicBackground.tsx`、`client/src/theme/scenic-ui.css` 及受行为影响的现有测试。

**接口:** 上传控件 `UserMediaUpload({purpose,onCommitted})`；头像展示 `ProfileAvatar({name,media,size})`；`WallpaperLibrary` 消费任务 4 store，模式与当前目标从服务端快照解析。组件不得各自维护第二套已保存资料。

- [ ] 写名称编辑测试：初始值、修改成功更新顶栏、取消、不合法输入、保存中防重复、失败保留输入和旧值、409 可重试。
- [ ] 写图片交互测试：本地预览/进度/验证状态、错误、取消、同文件重选、Object URL 释放；成功仅使用服务端返回资料；默认头像恢复；选择及删除个人壁纸，随机/固定 segmented control 和 system/user 缩略图选中状态。
- [ ] 写 ScenicBackground 测试：私人 URL 预加载与失败提示、固定 assetId 的 URL 更新不重抽，身份变化不残留旧图；现有主题和系统壁纸导航测试继续通过。
- [ ] 运行 `npm test -- src/components/auth/AccountProfileForm.test.tsx src/components/UserMediaUpload.test.tsx src/components/WallpaperLibrary.test.tsx src/components/ScenicBackground.test.tsx src/components/auth/appearance-navigation.test.tsx`，记录失败，实施后运行至通过。
- [ ] 用实际浏览器在 1440×900 与 390×844 检查账号页、背景菜单、长名称、图库满 20 张、上传和错误状态。缩略图/头像固定尺寸，移动端菜单可滚动，无重叠；键盘可进入控件并退出菜单；减少动画选项保持有效。如使用 Playwright，可沿用当前 client/test 下的验收基础设施，不新增无关浏览器依赖。

**产出:** 可使用的用户资料编辑和壁纸管理入口，保持现有书库/阅读器导航行为。

### 任务 6 并发与对象清理

**依赖:** 任务 1 至 3；隔离 DB 验证按门禁单独执行。

**文件:** 新增 `server/src/users/profile/profile-media-cleanup.service.ts` 及测试、`profile-media.db.spec.ts`；新增 `server/src/scripts/cleanup-profile-media.ts`、`server/test/jest-profile-db.json`；修改 `server/package.json` 增加专用命令 `test:db:profile`、`profile-media:cleanup`，不改变默认测试范围。

**接口:** `cleanup({dryRun: boolean, limit: number}): Promise<{eligible:number;deleted:number;failed:number}>`；脚本默认 dry-run，`--execute` 才能真实删除，仅处理配置 Bucket 和 `booksoul/profile/` 中已记录的精确 key。

- [ ] 单元测试覆盖 24 小时边界、READY 永不删除、未过期提交不删、当前引用复查、最终对象已写但提交失败、外部删除失败记录保留、重复清理幂等、有效期内不删 READY 的 staging。
- [ ] 增加 `.db.spec.ts` 验证真实事务：同一 revision 两个写入只有一个成功；并发签发不能超过持久配额或图库上限；重复提交不恢复旧头像；删除固定图与偏好原子提交。使用 mock OSS，不向云写对象。
- [ ] 在 server 运行 `npm test -- --runInBand src/users/profile/profile-media-cleanup.service.spec.ts`，预期通过；`npm test -- --listTests` 确认 `.db.spec.ts` 未进入默认测试。
- [ ] 仅显式配置并通过 `server/src/prisma/testing/isolated-database.ts` 的 `TEST_DATABASE_URL` 隔离门禁后，运行新增的 `npm run test:db:profile`。新增 Jest 配置只发现本任务 DB 文件，不加载 `.env`；fixture 仅清理本次 ID，不用无条件 deleteMany。
- [ ] 只读审查默认 dry-run 输出和精确删除范围；真实 `npm run profile-media:cleanup -- --execute` 需确认 Bucket、前缀、候选数量及删除影响后执行，不能作为默认质量门。

**产出:** 可证明并发一致性的专用验证、有限且可重试的清理工具。定时部署另行确认，不修改 ingestion worker。

### 任务 7 联调验收与运维说明

**依赖:** 任务 1 至 6；真实外部验收需单独配置和授权。

**文件:** 新增 `docs/user-profile-media-acceptance.md`；相关行为实施后增量修改 `client/README.md`、`server/README.md`，仅补资料功能、随机/固定规则和配置/验收入口。根 README 不复制完整接口细节。

- [ ] 检查 server/package.json、Jest 实际发现范围与环境加载路径；确认默认测试无真实 DB/OSS。随后分别在 server、client 运行 `npm run check`，记录结果；失败只修当前任务引起的问题，既有失败列出证据。
- [ ] 核对新增 SQL 和待部署迁移列表；若实际部署会一并应用其他待部署迁移，先报告，不自动把用户已有迁移一起执行。目标、备份和窗口获确认后再运行 `npm run prisma:migrate:deploy`。
- [ ] 在隔离账号/数据库及专用 OSS 验收前缀获授权后执行下节手工步骤，记录浏览器 Network、API 状态及脱敏只读数据库结果；不能将原始签名 URL、Authorization 或图片私人内容写入验收记录。
- [ ] 交付前审查 `git diff` 与 `git status`，只包含约定范围；记录自动测试、浏览器验收、迁移部署和真实 OSS 各自的实际完成状态。

**产出:** 能区分本地自动验证与真实集成验证的交付记录。

## 手工验收表

真实操作使用专用验收账号与非敏感测试图片；下列步骤在实施完成和外部操作获确认后执行，不是本次文档交付已运行的检查。

| 编号 | 操作 | 可观察的通过条件 |
| --- | --- | --- |
| A1 | A 登录，修改名称，刷新并在另一设备登录 | 各处名称一致；邮箱、角色、登录状态不改变。 |
| A2 | 上传头像，观察 Network，再更换一张 | 原图请求直接到 OSS；应用 API 不接收 multipart 图片；确认后顶栏及账号页更新，失败仍显示旧图。 |
| A3 | 上传两张壁纸并打开菜单 | 系统壁纸仍存在，A 的两张图均可选，上传未自动改固定模式。 |
| A4 | 默认随机下切页、聊天、刷新 | 切页/聊天不换图，刷新从系统+A 图抽取，候选多于一张时不立即重复；B 图不会进入候选。 |
| A5 | 固定系统图、A 的图、纯色并分别刷新 | 分别保持目标，随机和固定状态正确；另一设备读取相同固定偏好。 |
| A6 | 固定 A 图后删除该图，再切回随机 | 删除与 mode 更新同时成功；重新抽取，删除图不再出现在图库；主题值不改变。 |
| A7 | 切到 B，尝试 A 的 assetId 和伪造 owner | 私人图立即清除；API 返回统一 404/400；B 快照无 A 图片，数据库 A 引用无变化。 |
| A8 | 慢上传时退出，或同一 A 重新登录 | 在途 XHR 取消，旧响应不污染新 session，无旧预览或图残留。 |
| A9 | 两端同时保存，或 commit 成功后丢响应再重试 | 陈旧版本 409；重复 commit 不重复保存或恢复旧图。 |
| A10 | SVG 伪装 PNG、超大字节、损坏/动画/超像素图片 | policy 或后端拒绝；图片不进入 READY，旧资料保持不变。 |
| A11 | 短时 GET URL 到期与私有对象匿名访问 | 页面可见时刷新链接但选图不变；裸对象 URL 匿名读失败；不把签名链接保存到 localStorage。 |
| A12 | OSS 断网、错误配置、图库上限、清理失败 | 显式失败和重试入口；名称/系统壁纸独立可用；清理不误删 READY；失败未标成已删除。 |
| A13 | 访客、手机、键盘与长名称 | 访客无私人上传；界面无重叠，按钮可达，名字可换行，固定选择不破坏主题。 |

## 文档交付与功能交付区别

初次交付仅新增开发文档。用户随后确认按方案执行，并单独确认新增 `ali-oss`、`sharp` 和可选配置。实施过程中增加 `UserMediaAsset.stagingCleanedAt`，避免已清理 READY 暂存图重复占用清理批次；owner 外键采用 RESTRICT，避免删除用户后失去待清理对象记录，不新增账号删除能力。这些补充不改变上传或壁纸产品规则。

功能实现、已运行检查与未执行的数据库/OSS 步骤分别记录在[资料与图片验收记录](../../user-profile-media-acceptance.md)。上方复选框保留原始执行清单；不能将未运行的真实集成验收视为通过。

| 阶段 | 执行状态 |
| --- | --- |
| 任务 1–6 本地实现 | 已实现；前后端自动测试、图片真实解码、模拟 OSS 与清理验证通过 |
| 任务 5 浏览器 | 桌面/手机模拟验收通过，重复执行脚本已纳入 client/test |
| 任务 6 真实数据库验证 | 专用套件已编写，隔离目标和授权未提供，未运行 |
| 任务 7 质量门及文档 | 两个包检查通过，README 和验收记录已同步 |
| 任务 7 真实部署/OSS 联调 | 后续获授权完成本机备份、迁移、Prisma 生成、后端 CORS 与启动检查；真实 OSS 写入及专用 DB 测试未执行，详见验收记录 |
