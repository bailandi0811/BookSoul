# 封面跨页过渡连续性设计（Cover Continuity）

日期：2026-10-25
状态：已与用户确认方案（A + 移动端一并修复）

## 问题

从书架 / 图书空间进入阅读页或对话页时，书本封面的样式变化突兀；用户进一步澄清：主要是**落定停稳之后**的样式变化过程有跳动。已有 `book-cover-flight` 飞行系统，跳动发生在飞行收尾的 200ms crossfade——flyer（冻结的源封面样式）淡出、真实落点封面淡入，两者有可见差异时就会表现为"停下后的样式跳变"。差异来源：

1. 各页面封面内部排版是独立硬编码 px（标题 22/24/15/11px、内框 inset、页边宽度各不相同），crossfade 像是"换了一个物体"。
2. 对话页侧栏封面用 `compact`（标题、imprint 不渲染，只剩徽章块），与起飞封面完全不是同一造型。
3. 书签丝带只出现在书架和对话页侧栏；飞到图书空间/阅读页/欢迎区时丝带在 crossfade 中"啪"地消失，反向飞行时又"啪"地出现。
4. `LANDING.workspace` 优先落 58px 侧栏小块；空会话时页面中央还有 105px 欢迎封面，同屏出现两个封面，且飞的并非视觉主角。

## 方案

核心：让每个落点都是"同一本书的纯缩放副本"，crossfade 两侧逐像素重合，落定后的样式变化不可见。

### 1. 封面内部排版统一为容器相对单位

`.book-cover` 加 `container-type: inline-size`，内部元素改用 `cqw`（基准 190px 宽）：

- 标题：`font-size: 11.6cqw`，left `12cqw`、right `9cqw`。**不设字号下限**：下限会让落点封面与缩放后的 flyer 字号/换行不一致，重新引入 crossfade 文字跳动；小尺寸下的可读性由旁边的书名文本承担
- imprint：`font-size: 4.2cqw`（同理不下限）
- 内框 `::after` inset、书脊宽、页边宽、书签尺寸全部换算为 cqw
- 删除各 slot 的排版覆盖（仅保留宽度、旋转等布局属性）：
  - scenic-ui.css：feature/shelf 标题字号、welcome 排版覆盖、对应移动端媒体查询里的同类覆盖
  - reader.css：`.reader-book-cover` 全部排版覆盖（保留 76px/58px 宽度）

### 2. 对话页侧栏封面恢复完整书样式

`BookChat/components/Sidebar.tsx` 移除 `compact`，58px 小封面保留标题。`compact` 变体仍被 LandingPage 使用，其 CSS 保留。

### 3. 书签丝带全落点一致

所有 flight 落点封面统一传 `bookmarked={readingProgress?.mode === "IN_PROGRESS"}`（图书空间、阅读页侧栏、对话页欢迎区新增），与书架及对话页侧栏一致；crossfade 时丝带不再出现或消失。

### 4. 落点优先级

`LANDING.workspace` 改为 `["chat-welcome", "chat"]`：空会话落在中央欢迎封面（视觉主角），有消息时落侧栏。

### 5. 移动端核查结论（无需改动 flight 系统）

复核 `watchCoverFlight` 的取消路径：目标页已渲染但无落点（如 <1024px 阅读页侧栏不渲染）时，flyer 从未移动、始终精确覆盖在源封面上方，`cancelCoverFlight()` 移除 flyer 并恢复源封面在像素上完全等价——不存在"封面凭空消失"，取消路径视觉无损。原设想的 `dissolveCoverFlight` 不改变任何可见行为，按最小改动原则不引入。移动端的实际收益来自上面第 1、2、4 条。

### 6. 测试环境与真实浏览器对齐

`book-cover-flight.test.ts` 的 stub 元素显式设置 `transform-origin: 50% 50%`：项目 CSS（`.book-cover` 为 `left center`）不会加载进 happy-dom，其默认 computed origin 不稳定，而 WIP 的 pivot 数学依赖它——此前 2 个位移断言失败即由此而来，与实现无关。

### 7. 悬停倾斜起飞跳变（实测确诊与修复）

真实浏览器逐帧测量结论：三条主路径的**落点**均像素级对齐（gap 0），收尾淡出干净；剩余跳变发生在**书架网格项的起飞瞬间**——`@media (hover: hover) and (pointer: fine)` 下的悬停倾斜 `perspective(650px) translateY(-3px) rotateY(-10deg)` 使真实封面投影与 flyer 复刻不一致（合成元素实测：偏移 dx≈4px、dy≈11px、尺寸差约 16-22px），点击瞬间封面"跳变"。

修复三处：

1. `scenic-ui.css` 悬停倾斜规则补 `transform-origin: center center`（与 flyer 的 origin 一致，rotateY 铰链对齐）；hover 视觉从"绕书脊倾斜"变为"绕封面中心倾斜"，倾斜立体感保留。
2. 移除 `.bookshelf-display` 的 `perspective: 700px`（祖先透视无法被 flyer 继承；倾斜自带 transform 列表内的 `perspective(650px)`，父级透视为多余放大源）。
3. `book-cover-flight.ts` 的 `flightTransform` 补偿投影双计：`box.cx/cy` 测自投影包围盒（已含倾斜位移与透视偏心），transform 会再次施加倾斜，故 translate 需减去 `tilt.ty` 与透视近边放大引起的横向中心偏移 `tiltCenterShiftX(ry, persp, width)`（解析式，与实测 2.53px 吻合）。

修复后合成验证：源封面与 flyer 投影差 dx -0.008px、dy 0.077px、宽 0.00002px，亚像素级重合；起飞、飞行、落点全链路无缝。

### 8. 收尾同帧硬切换（去除最后的轻微残感）

上一轮验证确认落点几何逐像素对齐后，剩余的"轻微闪动感"来自收尾 200ms crossfade 本身：两图层同时渲染导致阴影叠加变深再回落、文字出现"缩放模糊→原生锐化"的重影，整段 200ms 可见。既然两图层已亚像素一致，交叉淡出是唯一残差来源——`settleCover` 的 handoff 改为**同帧硬切换**（显示落点封面 + 立即移除 flyer，无淡出动画），`SETTLE_MS` 删除。飞行的 240ms 落点微调动画保留作为安全网。

### 9. 阴影等比化（大比例缩放路径的最后闪动源）

同帧切换后，剩余闪动仅出现在尺寸差异大的路径（192px ↔ 阅读页 76px / 对话页 105/58px）。根因：封面 `box-shadow` 是固定 px——flyer 缩到 0.4 倍时阴影随 transform 缩小，落点原生渲染却是完整 px 值，落定瞬间阴影尺寸跳变约 2.5 倍。

修复时踩了一个容器查询规范细节：**cqw 只对后代与伪元素生效，对元素自身的属性会错误解析到祖先容器（无则回落视口单位）**——直接把阴影写成 cqw 得到 53px 的视口级阴影。因此：

- 外层阴影移到 `.book-cover::before`（伪元素按 `.book-cover` 容器解析 cqw），`3.7cqw 4.2cqw 6.3cqw -3.2cqw` 与 `0 10.5cqw 12.6cqw -10.5cqw`；
- 元素自身仅保留 inset 发丝线；
- `border-radius` 保留固定 px（2/6px，落定时右侧圆角差 <4px 的圆弧差，远小于阴影跳变，不再引入）；
- 实测验证：76px 封面伪元素阴影 2.812/3.192/4.788px，恰为 192px 封面（7.1/8.06/12.06px）的 0.4 倍等比。

### 10. 装饰细节等比化（样式统一）

用户确认阴影闪动消除后，指出到阅读页/对话页时封面"样式不统一、有样式变化的跳动"。根因是装饰细节仍是固定 px，不随尺寸等比：纸质纹理条纹（2/3px）、页边条纹（1/3px）、各处 1px 发丝线（内框、书脊棱线、标题投影、封面内沿高光）、2/6px 圆角。76px 封面上这些细节相对粗 2.5 倍，落定瞬间"材质感"整体跳变。

全部等比化（基准 190px 宽）：

- 纹理条纹与页边条纹：渐变停靠点改 cqw（`::before`/pages 为伪元素/子级，cqw 解析正确；实测 76px 封面条纹 0.40px ≈ 192px 的 0.4 倍）；
- 发丝线（内框 border、书脊 border-right、标题 text-shadow、内沿 inset 高光）改 `0.53cqw`，并入 `::before` 的阴影列表（元素自身无法用 cqw，见第 9 节陷阱）；
- 圆角用百分比 `1.05% 3.16% 3.16% 1.05% / 0.79% 2.37% 2.37% 0.79%`（横向按宽、纵向按高换算成圆形，随尺寸缩放）；
- 删除 `.book-cover-flyer` 已失效的阴影覆盖（阴影统一由 `::before` 的等比规则提供，flyer 克隆自动同源）。

注：极小尺寸下浏览器会把发丝线取整到设备像素（DPR 1.5 时 0.4px 报告为 0.667px），属正常渲染行为，无可感知差异。

### 11. 周期性微纹理移除（纹理/线条渲染路径差异）

细节等比化后，用户仍报告到阅读页/对话页时"纹理、线条有变化"。根因在光栅化层面，CSS 等比无法解决：封面的纸纹是 `repeating-linear-gradient` 周期细纹（2/3px 与 3/4px 两组，含一组竖向条纹），等比缩小后周期落入亚像素区间时——**原生小尺寸渲染**（清晰细条纹）与 **flyer 的大尺寸经 GPU 缩放渲染**（摩尔纹/均匀灰化）走两条不同的光栅化路径，落定瞬间纹理特征必然改变。任何周期性图案在非整数倍缩放下都无法跨渲染路径一致。

修复（`index.css`）：

- `::before` 移除两组 repeating 细纹，仅保留平滑 110° 对角渐变（平滑渐变缩放不变）；
- 页边 `repeating` 条纹改三段式渐变色带（百分比停顿，缩放不变）；
- 保留单根发丝线（内框、书脊棱线等）：单线的光栅差异是边缘柔化级别，远小于周期纹理的摩尔纹差异。

设计取舍：封面失去 2-3px 级的"纸纹颗粒"（原本在大尺寸下也只是极淡的质感），换取所有尺寸、两条渲染路径下外观完全一致。截图确认：移除后封面仅保留设计意图中的内框线与徽章线稿。

### 12. 封面飞行期间的页面过渡节奏（录屏逐帧确诊）

封面层逐像素统一后，用户仍感知"闪"，并提供了 Chrome 录屏（2320×1440）。经逐帧扫描（本地 Node 零依赖 HTTP 服务器供浏览器加载视频，页内 canvas 逐帧 seek 计算帧差与区域分析）：5 次过渡的帧间差异均为 **1-2 帧的硬切尖峰**（平均值的 17-27 倍），集中于屏幕中下部内容区；闪动帧显示新页面单帧内整体出现。前两版页面过渡各有问题：

- 旧版 `fade(0.5)`：新旧两页 500ms 双向交叉淡化，中段同时半透明叠在风景上，全屏"洗白"；
- 中间版（目标页立即全不透明出现）：消除叠透，但整屏内容单帧硬切，同样被感知为闪。

最终修复（`screen-transition.ts`）：`coverFlight` 过渡为**短促柔和的进入**——220ms 淡入 + 12px 上浮，旧页同步淡出；既无单帧硬切也无长时间叠透。落点封面所在页面的轻微入场位移由飞行的逐帧追踪机制兜住（旧注释"页面不能动"针对的是已废弃的 WAAPI 一次性测量实现）。另核实：此前记录的"点击后 320ms 死寂"是自动化点击工具的延迟假象，`openBook` 实为同步切视图。

### 13. 阅读页 / 对话页按图书空间尺寸绘制再缩放

等比化、去周期纹理、同帧切换之后，用户录屏（13-43-31）仍显示：**只有到阅读页 / 对话页（及从这两页返回）时**，线条、纹理感、亮度会跳一帧。书架 ↔ 图书空间正常，不得改动。

根因不再是 CSS 数值不一致，而是光栅化路径不同：flyer 始终是约 192px 封面经 GPU 缩放；阅读页 76px、对话欢迎 105px、对话侧栏 58px 却在该小尺寸上**原生重绘**。亚像素发丝线、阴影和对比度会被浏览器重新取整，落定瞬间换一条渲染路径。

修复只动这三个落点：外层槽位（`reader-book-cover` / `assistant-welcome-cover` / `chat-sidebar-cover`）保持原来的布局尺寸并挂 `data-cover-slot`，供飞行测量；内层 `.book-cover` 固定按 192px 绘制，再用 `scale(槽宽 / 192)` 缩进槽位。落点与 flyer 走同一条「大图 GPU 缩放」路径。`transform` 不写在被测量的槽位节点上，避免 `offsetWidth` 与视觉框再次分叉。书架和图书空间封面保持原生绘制。

从阅读/对话槽位返回时，若克隆整个槽位再把 76px 合成层放大到 192，飞行中会发糊、落定后突然变清晰。`beginCoverFlight` 改为克隆内层 192px 封面，flyer 布局尺寸保持绘制尺寸，只用 transform 缩放到槽位；去程与回程都不再把小图放大。同时去掉 flyer 的 `will-change: transform`，避免起飞瞬间图层提升造成的突然发糊。

## 范围

- 修改：`client/src/index.css`、`client/src/theme/scenic-ui.css`、`client/src/theme/reader.css`、`client/src/components/BookChat/components/Sidebar.tsx`、`client/src/components/BookOverview/index.tsx`、`client/src/components/BookReader/components/ReaderSidebar.tsx`、`client/src/components/BookChat/index.tsx`、`client/src/lib/book-cover-flight.ts`（仅落点顺序）、`client/src/lib/book-cover-flight.test.ts`（stub origin）
- 第 13 节仅再改阅读页 / 对话页三个槽位的 markup 与 `.book-cover-paint-slot`，不改书架、图书空间、飞行数学、页面过渡
- 不动：flight 系统其余逻辑（测量/插值/收尾/取消、pivot/tilt 数学）、`compact` 变体本身（LandingPage 仍在用）、auth/landing 装饰封面、页面级 screen-transition

## 验收

- 书架/图书空间 → 阅读页/对话页：封面全程是"同一本书在缩放"，落定后的 crossfade 无换脸、无文字跳动、无丝带突变
- 空会话进入对话页只有一个封面参与过渡（中央欢迎位）
- 各断点（含移动端）下封面均为同一设计的等比副本
- `cd client && npm run check` 通过（lint + 299 测试 + 类型检查 + 构建均已验证）
