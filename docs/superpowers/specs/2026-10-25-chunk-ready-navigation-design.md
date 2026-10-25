# Chunk 就绪再切屏 + 过渡 Fallback（B + C）

日期：2026-10-25  
状态：已与用户确认（B + C）

## 问题

首次从书架进入本书空间时，`BookOverview` 为 lazy chunk。旧流程在 chunk 未到时已切屏并显示空 Suspense fallback，封面 flyer 在目标 DOM 出现前无法 `land`，用户感到「点了卡住、只剩一本书在空屏上」。

## 方案

### B — Chunk 就绪再改 `view`

- 书架入口经 `openBookFromShelf`：**先** `beginCoverFlight`（含短起飞抬升），**再** `openBook`；chunk 仍在 `openBook` 内就绪后再切屏。主飞行 `FLIGHT_MS` 略放慢（720ms），与 chunk 加载重叠。
- 书库 `Entrance` 挂载时继续 `preloadLibraryDestinations`；书架按钮 `pointerdown` 按目标路由预热。
- `openBook` / `switchBookView` 在调用 `scheduleScreenChange` **之前** `await loadBooksViewModule(target)`（仅 JS 模块，与 metadata 请求并行）。
- 取消/ supersede：`openBook` 用既有 `navigationGeneration`；`switchBookView` 用独立 `switchViewGeneration`。
- chunk 加载失败仍切屏，由 Suspense / 页面自身报错，避免用户卡在书架。

### C — 非空 Fallback

- Suspense fallback 使用与书库一致的雾面与纸面氛围（`book-navigation-shell`），避免纯色空屏。
- 仍显示「正在翻开书页…」状态文案；风景层 `ScenicBackground` 保持全局。

## 非目标

- 假坐标临时落点、改 `FLIGHT_MS`、改 `screenShift` 时长。
- 把 Overview 打进主包。

## 验收

- 冷启动首次点 READY 书籍：chunk 未到时书架仍可见，flyer 在书架上；chunk 就绪后切屏且很快开始落点飞行。
- 若仍 hit Suspense（侧页、Entrance lazy 等），fallback 不是空白中间态。
- `book-cover-flight` 与 `useBooksStore` 相关测试通过。
