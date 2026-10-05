# 书友客厅实施与验收记录

## 2026-10-05 交互更新

最新交互以[交互更新设计](superpowers/specs/2026-10-05-community-chat-interaction-design.md)为准，下文 2026-10-04 记录保留作为基线历史。用户已要求按讨论和风景设计稿直接实现，无独立 HTML 交付。

- 风景背景/胶囊顶栏沿用项目；单一纸面消息面板，左右气泡、作者分组、受保护账号头像、书签式引用，输入框按内容伸缩，支持暗色/手机/reduced-motion。永久装饰侧栏已移除。
- 全站只有聊天室入口统一未读数字，没有通知卡、铃铛、声音；人类 @ 标签和引用独立，默认引用加 @、可单独删除。成员查询使用 public memberId；服务端验证同房间目标和目标变化幂等冲突。
- 新客户端按视口内连续可见 700ms 的消息提交已读 ID，每 2 秒合并批次。旧 throughSeq 接口只为旧客户端保留；新 UI 不调用它。进入最新不会清空看不到的旧消息或 @。缓存外上下文和未读定位由服务端房间授权查询。
- 首次加入/已有成员确认头像说明版本 2026-10-05；未确认者头像不公开。头像只返回受保护当前 READY WebP 字节，不返回 userId、私有 key/签名 URL；删除/换头像在后续读取时生效，前端最多 60 秒刷新，失败显示首字。
- 新增迁移 `server/prisma/migrations/20261005100000_community_mentions_visible_read/migration.sql`：只新增 mentions JSON 和按成员/消息唯一的已读收据。初次代码交付时未执行；随后用户明确要求补齐，已在本机数据库应用。默认 DB 测试发现范围已核对排除专用集成测试。

已运行：Server check 85 suites / 536 tests（44 个既有 lint warning、零错误）；最终 Client check 53 files / 229 tests，lint/typecheck/build 均通过。浏览器使用实际 build + 内存 HTTP/WS：显式加入、引用/@独立、发送撤回、历史窗口100/缓存500边界、回看不抢位、旧 @ 保留、上下文定位后可见已读、1440/375/320 及暗色、首次加载其他页面的统一角标、无运行异常；锚点差 0px。

一次独立终审发现初始快照覆盖目标跳转、摘要 GET 与已读 POST 交错恢复旧角标、@ 搜索选中旧候选三项问题；均先以失败回归复现，再修复并通过最终 check。入口角标另通过隔离浏览器 RED→GREEN 验证。浏览器中间一次运行出现无堆栈的断言失败，增强诊断后重跑通过，未确认该次失败原因；真实跨端与移动软键盘仍属于发布验收。

迁移补齐记录：用户报告 community/me 和 membership 返回 503，只读检查确认原四表存在、mentions 和 CommunityMessageRead 缺失。经用户授权，核对本机目标与全部迁移记录，确认只有该迁移待执行；先生成完整 custom-format 备份并通过 pg_restore --list 检查，再运行 Prisma migrate deploy，成功应用唯一待执行迁移。之后只读验证迁移完成、JSONB 非空默认空数组、收据表可读、现有成员的未读和 @ 统计查询通过。未清空数据、修改环境配置或运行真实库测试。备份与 hash 清单保留在 gitignored 本机执行目录，不提交数据库内容。

未验证：独立 DB 集成、真实 OSS 头像代理、双真实账号和生产 WSS 代理。Prisma generate 的 DLL 替换仍因现有进程占用 EPERM；TS/JS 新模型已生成、typecheck/build 通过，不把完整 generate 记为成功，没有结束占用进程。后续仍需以真实登录浏览器验证重新连接；此次修复未调用需要身份的真实 API。

## 2026-10-04 基线历史

日期：2026-10-04。结论：功能代码与本地质量门已完成；**尚不能宣称已部署或已通过真实数据库/生产代理验收**。本记录中的浏览器测试使用实际构建产物和本机内存 HTTP/WS 夹具；服务端 WS harness 使用真实 HTTP/WS socket 与 mock 业务服务，两者都不连接应用数据库。

## 交付与改动边界

- 独立 `#community` 页面与顶栏入口，显式入场同意、纯文本收发、引用、双向历史、未读/回复提醒、撤回、隐藏与禁言；没有 AI 调用。
- 同端口 Nest Gateway + 原生 WS；Origin 绑定的短期一次性票据在 upgrade 前鉴权；消息/事件同事务保存，重连按事件补齐，ack 不推进重放游标；资源、超时、配额与重试有界。
- 独立 community store，不持久化消息/草稿；账号切换立即清理并隔离迟到响应；DOM ≤100、缓存 ≤500、待发 ≤20。滚回旧窗口尾部不会把未显示消息标已读，须补齐或跳至最新。
- 新增公共四表迁移；私人书籍、助手会话、检索和记忆没有改动。已有前端文件只增加 App 路由/宿主、AppHeader 入口、app-flow 判断和 Vite WS 转发，没有编辑书架/阅读页/私人聊天状态或全局样式。
- 工作区其他书籍、阅读器、封面动画及个人资料改动属于已有或并行工作，本任务保留它们；不能将全部 git diff 归为聊天室改动。

主要文件：`client/src/components/CommunityChat/`、`client/src/lib/community-*`、`client/src/store/useCommunityStore*`、`server/src/community/`、`server/src/scripts/community-moderator*`、`server/test/support/community-db-fixture.ts`、`server/test/jest-community-db.json`、`server/prisma/migrations/20261004113000_community_chat/migration.sql`。

## 已运行证据

- Client `npm run check`：lint、52 个测试文件 / 220 个测试、TypeScript 和 production build 通过。
- Server `npm run check`：lint、TypeScript、84 个测试套件 / 528 个测试、Nest build 通过。现有 lint 有 44 个 warning，没有 error；未改无关代码消除 warning。
- 默认 Jest `--listTests` 已核对排除 `.db.spec.ts`；默认测试未加载 `.env` 或连接真实库。隔离数据库门禁相关单元测试已通过。
- Prisma schema validate 与新增 SQL 的离线生成通过；SQL 仅新增公共枚举/表/索引/外键，未执行迁移。正常 `prisma:generate` 的 engine DLL 替换遇到 Windows EPERM，占用进程未被停止；TS/JS 模型已生成、现有 engine 与源 engine 的 hash 一致，两个构建通过，但不能把完整 generate 记为成功。另一次隔离输出尝试因 Prisma 根目录自动安装提示被主动取消，未生成根 package.json/lock 或修改应用配置。
- 新增官方包与 scoped ws override 已核对实际树；官方 audit 报告现有树 64 项漏洞，没有 ws advisory。未执行 audit fix、框架升级或修改 registry 配置。
- `node client/test/verify-community-browser.cjs`：实际构建客户端 + 内存 HTTP/WS，通过显式加入门禁、单一 WS 宿主、收发/撤回、草稿开场、回看不跳底、1000 条变长 fixture 的分页窗口、亮暗主题、1440×900 / 375×812 / 320×740、Escape 焦点恢复和无运行时异常检查。桌面历史前插实测锚点差 **0.3125 px**。截图在 gitignored `.superpowers/sdd/2026-10-04-community-chat/browser/`。
- 一次独立只读审查发现浏览器关闭码、窗口漏显/提前已读、重连分页锁住和禁言缩短四项问题，已分别建立失败回归后修复；另补缓存、待发上限与五次短连接失败停止的回归。

本机 npm shim 失效，实际使用 Node 22.19.0 的 npm-cli.js 运行；只给检查进程提供临时 npm wrapper，没有修改永久 PATH、`.env` 或项目脚本。Browserslist 数据过期提示保留，没有新增无关更新。

## C01–C15 对照

完整步骤和固定数值见[设计契约](superpowers/specs/2026-10-04-community-chat-design.md#9-验收矩阵)。这里将“已测局部”和“完整发布门禁”分开记录。

| 编号 | 本次证据 | 完整发布验收状态 |
| --- | --- | --- |
| C01 | 可信 claims/成员、一次性票据、Origin/容量及 101 前拒绝的单测与真实 socket harness；浏览器加入前历史/票据请求为 0 | 本地通过，代理链未验证 |
| C02 | 实际客户端连内存 WS 收发，昵称与本地默认头像；页面只出现一个自有气泡 | 未运行真实 DB 双账号浏览器及 20 次 ≤1.5s 延迟测量 |
| C03 | 服务端幂等/冲突、提交后 ack；客户端 ack→event 去重、丢 ack 原 key 手动重试 | 真实数据库并发/重启待专用测试库 |
| C04 | 只查同房间引用、非法 ID 404、移除 410；投影摘录上限与删除引用为空 | 单测通过，真实 DB 待验证 |
| C05 | 快照水位、顺序补齐、HTTP 请求中实时消息合并回归 | 单测通过，真实事务提交顺序待验证 |
| C06 | 补扫/replay/当前 tombstone；客户端清空全部缓存引用 | 单测通过，真实离线/重启双端待验证 |
| C07 | 回看不推进已读、持有窗口、浏览器新消息按钮；账号内草稿留在内存 | 本地局部通过，双账号/后台完整流程待验证 |
| C08 | 1000 行内存 fixture、跨 500 行边界分页、DOM 窗口；cache/pending 上限单测；桌面前插差 0.3125px | 本地前端已验证；真实 DB 场景和不同视口锚点矩阵待补 |
| C09 | 过期/撤销身份、心跳和健康连接；旧账号帧/响应/草稿拒绝 | 单测局部通过，真实 token/multi-tab/presence 联合验收待补 |
| C10 | 输入/Unicode/归属/坏帧/二进制/未知帧；真实 socket 超大帧关闭；HTML 纯文本及 IME 界面测试 | 本地通过 |
| C11 | 持久配额策略、连接预约、队列/背压/超时；短连接失败五次停止 | 本地局部通过；真实多连接共享配额待 DB 验证 |
| C12 | 非作者/非管理员拒绝、幂等禁言不延长且新动作不缩短；浏览器自有撤回 | 单测局部通过，真实管理员跨端隐藏/禁言待验证；未授予真实角色 |
| C13 | 显式公共 projection 拒绝邮箱/账号字段，无私人模块依赖；不记录票据/正文 | 静态/单测通过；真实私书/私会话/记忆 fixture 未建立 |
| C14 | 实际页面的亮暗/三种视口、加入 Escape/focus、开场仅填草稿；IME 单测 | 本地通过，移动软键盘及完整双浏览器导航待补 |
| C15 | 两包完整 check、默认 DB 排除、隔离目标拒绝测试 | 通过 |

## 启用前仍需完成

1. 按[服务端说明](../server/README.md)核对真实 DB 指纹、备份和全部待应用迁移，再确认部署。没有运行真实迁移、修改 `.env` 或初始化真实管理员。新增表尚未部署的数据库不能直接启用本模块；停止 engine DLL 的占用进程后需重新生成 Prisma client。
2. 调用者显式提供并确认独立 `*_test` / `test_*` 目标后，部署测试库迁移并运行 `npm run test:db:community`。fixture 在任何 Prisma 实例创建前验证目标，仅按本次唯一房间和身份 allowlist 清理，没有全表重置。
3. 在隔离服务上完成真实双账号、断网/重启、1000 行、延迟和角色验收，再检查生产 WSS、101 Upgrade、Origin/子协议转发、空闲心跳和脱敏日志。当前单实例上限为 100 条连接，不支持多实例广播。

未运行私人阅读 E2E：本任务未改变上传、索引、防剧透检索、记忆或删除书籍闭环，也没有实际外部模型/向量/源文件写入授权。
