# 翻页过渡性能设计（Transition Budget）

日期：2026-10-25
状态：已与用户确认方案（过渡预算）

## 问题

用户感到产品「卡」，进一步定位后只发生在 **AppScreenStage 翻页**：书架、本书空间、阅读、对话，以及同一舞台上的侧页。两种症状同时存在：

1. **起手停顿：** 点了之后先愣一下，封面和整页才开始动。
2. **过程掉帧：** 动画进行中一顿一顿。

同一点击帧里现在会连续做三件重事：`beginCoverFlight` 克隆封面并对每个子节点 `getComputedStyle`、React 挂上整页新树并保留旧树退出、风景层的 `filter` / `backdrop-filter` / SVG 噪点 / `:has()` 雾面开始一起重绘。封面飞行的造型和时长不是问题，问题是飞行和整页淡入淡出下面叠了太多重绘。

约束：气质尽量保留，只做用户几乎看不出的性能优化。封面飞行路径、落点连续性、`screenShift` 时长表都不改。

## 非目标

- 不改阅读长文滚动、对话流式输出、后端检索或 Embedding。
- 不改封面飞行的视觉设计、`FLIGHT_MS`、落点数学或同帧硬切换。
- 不缩短 `screenShift` 各条路径的 duration。
- 不引入 View Transitions，也不把离开页拍成位图。
- 不把阅读器 / 对话页拆成「先壳后内容」。

## 成功标准

- 目标页模块已预热时：点击后的第一帧就能看到封面 flyer 或整页开始位移，不再先空等一整帧以上的同步样式计算。
- 过渡进行中：全屏背景不再每帧重做饱和度滤镜合成，玻璃层不再做 live `backdrop-filter`，雾面不再走 720ms `:has()` 插值，全屏噪点关闭。
- 过渡结束后：上述效果在同一帧恢复，落定后没有第二次雾面动画。
- 减弱动效路径保持现状（封面不飞，整页近乎瞬间淡出）。
- 封面跨页连续性既有测试仍然成立。

## 方案

给每次翻页开一个 **过渡预算**：从点击到「整页入场结束且封面飞行结束（或取消）」为止，用计数器维持 `html.screen-moving`。预算只改变合成成本，不改变运动轨迹。

### 1. 预算开关

新增 `client/src/lib/transition-budget.ts`：

- `beginTransitionBudget()` / `endTransitionBudget()` 引用计数。
- 计数从 0 到 1 时给 `document.documentElement` 加上 `screen-moving`；回到 0 时去掉。
- 封面飞行租约：`beginCoverFlight` 成功后 `begin`，`settleCover` 完成、`cancelCoverFlight`、或 `watchCoverFlight` 超时取消时 `end`。
- 整页动画租约：`AppScreenStage` 在即将换页时 `begin`，进入屏 `onAnimationComplete("center")` 时 `end`。没有入场动画（首次挂载、减弱动效、HappyDOM 时长为 0）的路径必须在同一轮里配对 `end`，不能把计数留在 1。
- 两次快速连点：旧飞行 `cancelCoverFlight` 先还清旧租约，再开新租约；整页以最新 `screenKey` 为准，旧退出屏不再持有租约。

`screenShift` 的位移、时长、封面飞行缩短为 220ms 的规则全部不动。

### 2. 点击后分帧

点击处理保持「先飞、再切页」：

1. **当前帧：** `beginCoverFlight`（若有封面）并打开预算。
2. **下一帧 `requestAnimationFrame`：** 再改 `view` / 路由，让 React 提交新屏。

所有会改 `AppScreen` 的入口都走同一条调度，避免有的路径立刻切、有的路径拖一帧：

- `useBooksStore` 的 `openBook` / `switchBookView` / `backToLibrary`
- `App` 里账号、社区、塔罗、回首页这些会改 `screen` 的 setState

`openBook` 里与首帧绘制无关的数据准备（写入 `currentBook`、启动 workspace 请求、中止旧请求）可以留在点击帧；只有导致 `AppScreenStage` 换 `screenKey` 的状态放到下一帧。连续导航必须合并：后一次调度取消前一次未执行的 rAF，不得排队切两次。

模块预热保持现状：`preloadOverview` / `preloadReader` / `preloadChat` / `preloadLibraryDestinations`。本设计不把目标页改成轻量壳。

### 3. 起飞不再扫全树

`freezeLook` 不再对封面每个子孙做 `getComputedStyle`。克隆节点已经带着 class 和容器查询，flyer 离开书架后只需要冻会丢的字号：

- `.book-cover-title`
- `.book-cover-imprint`

根节点仍复制 `backgroundColor`、`borderRadius`、`boxShadow`，避免父级规则（书架倾斜、特征位尺寸）把 flyer 带偏。书脊、页边、丝带、徽章不再逐节点读计算样式。

`placeFlyer`、落点跟踪、同帧硬切换、`SETTLE_MS` 已删除后的行为都不动。

### 4. 过渡中的便宜画法

`html.screen-moving` 只在预算开启时生效，目标是「看起来还是那一层雾和纸」，但不要对两页实时取样：

| 现有效果 | 预算开启时 | 为什么几乎看不出 |
| --- | --- | --- |
| `.scenic-background img` 的 `filter: saturate(...)` | 图层固定，不随两页位移重绘。用 `contain: paint` 和独立合成层缓存已滤色的图，不在过渡中关掉饱和度 | 饱和度数值不变，只是不再每帧重滤 |
| `.scenic-background::after` 全屏 `feTurbulence` 噪点 | `opacity: 0` | 原透明度 0.11，位移时本就看不见颗粒 |
| `.scene-veil::before/::after` 的 720ms opacity | `transition: none`，雾面立刻落到**目标页**对应值 | 双页叠加时不再插值两层全屏渐变；落定后也不再补一段雾面动画 |
| `.glass`、scenic 与社区里的 `backdrop-filter` | 取消 blur，留下元素已有的半透明底色 | 两页同时做 live 取样是掉帧主因；纸色底已经接近雾面玻璃 |

选择器以 `scenic-ui.css`、`index.css` 的 `.glass`、`community-chat.css` 里现有 `backdrop-filter` 为准，不新增第二套颜色。预算结束的同一帧去掉 `screen-moving`，这些规则失效，实时效果恢复。

离开屏已有 `data-present="false"`。预算开启时给离开屏加 `contain: paint` 和 `content-visibility: auto`，避免退出淡出还去排不可见子树。进入屏保持可交互锁（现有 `data-moving` 滚轮/触摸锁）不变。

### 5. 失败与边界

- **减弱动效：** 不起飞，整页 duration 仍是 0.01。预算可以开，但必须在同一轮还清；CSS 便宜画法即使闪一帧也不会被看见。
- **飞行超时 / 目标页无落点：** 现有 `watchCoverFlight` 800ms 取消逻辑保留，取消时还飞行租约。
- **目标块尚未加载：** 仍显示「正在翻开书页…」。flyer 等落点，不等待预算结束。
- **组件卸载：** `AppScreenStage` 和飞行 host 的 cleanup 必须 `end` 自己持有的租约，禁止残留 `screen-moving`。
- **无 `document` 的测试环境：** 预算模块写 class 前先看 `documentElement`，没有就只维护计数。

## 测试

只锁契约，不做截图像素对比，不断言帧率数字。

1. **`transition-budget`：** 两次 `begin` 一次 `end` 仍保持 `screen-moving`；配对还清后 class 消失；无 DOM 时不抛错。
2. **分帧切页：** 点击/调用 `openBook` 或 `switchBookView` 的当帧 `view` 仍是旧值；rAF 之后才变成目标。连点以最后一次为准。无飞行的侧页切路同样分帧。
3. **起飞：** `freezeLook` 不再遍历所有子孙；标题和署名仍被写入 inline 字号。现有 `book-cover-flight` 几何与取消测试保持绿色。
4. **CSS：** `scenic-ui.css`（及需要时的 `index.css` / `community-chat.css`）存在 `html.screen-moving` 规则：噪点关闭、veil transition 关闭、backdrop-filter 关闭、背景图 contain。
5. **整页租约：** `AppScreenStage` 入场结束会 `end`；时长为 0 的路径不会把预算留开。

## 验证

- `cd client && npm test --` 覆盖上述相关文件，再 `npm run check`。
- 人工在真实浏览器走：书架 → 本书空间 → 阅读 / 对话 → 返回，以及书架 ↔ 社区 / 塔罗 / 账号。确认起飞不再愣、飞行中少掉帧、落定后雾面不二次变。
- 本机若只有集成显卡，以这本书架进出路径为准；不把实验室 FPS 计数写进质量门。

## 风险

- 玻璃在 220–560ms 里会少一层真模糊。半透明底色已接近当前纸色，若仍觉得「雾突然实了」，只把 blur 半径降到 0 以外的更小值，不恢复 live 双页取样。
- 分帧切页让封面先飞、旧页晚一帧才开始退。这是为了消起手停顿；若某条路径没有预热模块，仍可能先看到「正在翻开书页…」，这是既有 Suspense，不在本设计扩范围。
- `html.screen-moving` 是全局标记。预算计数必须在取消、超时、卸载时还清，否则模糊和噪点会一直关着。
