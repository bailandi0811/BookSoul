# 翻页过渡性能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 翻页点击后第一帧就能看到封面起飞或整页开始动，过渡过程中不再叠加 live 模糊、雾面插值和全屏噪点，封面飞行造型与时长保持不变。

**Architecture:** 用 `transition-budget.ts` 的引用计数维持 `html.screen-moving`。封面飞行和整页入场各持一租；点击帧只起飞并打开预算，下一帧 `requestAnimationFrame` 再改 `AppScreen`。过渡 CSS 把贵的滤镜换成静态等价物，结束后同一帧恢复。

**Tech Stack:** 现有 React 19、TypeScript、Zustand、Framer Motion、Vitest/happy-dom；不新增生产依赖。

**Spec:** [翻页过渡性能设计](../specs/2026-10-25-page-transition-performance-design.md)

## Global Constraints

- 气质保留：不改 `FLIGHT_MS`、落点数学、同帧硬切换、`screenShift` 时长表。
- 不改阅读滚动、对话流式、后端检索；不把阅读器/对话页拆成轻量壳。
- 不引入 View Transitions，不把离开页拍成位图。
- 保留当前未提交工作；未经用户明确要求不创建分支、不提交、不 push。
- 不修改 `.env`、密钥或部署配置。
- 默认质量门不连数据库。每个缺陷先写失败测试，再写最小实现。

## File map

| 文件 | 职责 |
| --- | --- |
| Create: `client/src/lib/transition-budget.ts` | 预算计数、`html.screen-moving`、分帧切页调度 |
| Create: `client/src/lib/transition-budget.test.ts` | 计数、class、分帧、连点合并、无 DOM |
| Modify: `client/src/store/useBooksStore.ts` | `openBook` / `switchBookView` / `backToLibrary` 的 `view` 改到下一帧 |
| Modify: `client/src/store/useBooksStore.test.ts` | 当帧 `view` 不变；flush 后才变；旧用例跟着 flush |
| Modify: `client/src/App.tsx` | 会改 `AppScreen` 的 setState 走 `scheduleScreenChange` |
| Modify: `client/src/App.auth-navigation.test.tsx` | `expectScreen` 等待一帧，避免分帧后误判 |
| Modify: `client/src/lib/book-cover-flight.ts` | `freezeLook` 只冻标题/署名；飞行租约 begin/end |
| Modify: `client/src/lib/book-cover-flight.test.ts` | 不再扫全树；取消/落定还清飞行租约 |
| Modify: `client/src/components/AppScreenStage.tsx` | 入场结束或 0 时长路径释放整页租约；卸载还清 |
| Modify: `client/src/components/AppScreenStage.test.tsx` | 换页持有、入场结束释放、0 时长不泄漏 |
| Modify: `client/src/theme/scenic-ui.css` | `html.screen-moving` 便宜画法 |
| Modify: `client/src/index.css` | `.glass` 在预算中关闭 blur |
| Modify: `client/src/components/CommunityChat/community-chat.css` | 社区房间在预算中关闭 blur |
| Modify: `client/src/theme/cssTokens.test.ts` | 断言上述 CSS 规则存在 |

---

### Task 1: 过渡预算模块

**Files:**
- Create: `client/src/lib/transition-budget.ts`
- Test: `client/src/lib/transition-budget.test.ts`

**Interfaces:**
- Consumes: `document.documentElement`（可缺席）
- Produces:
  - `beginTransitionBudget(): void`
  - `endTransitionBudget(): void`
  - `isTransitionBudgetActive(): boolean`
  - `holdFlightBudget(): void`
  - `releaseFlightBudget(): void`
  - `holdScreenBudget(): void`
  - `releaseScreenBudget(): void`
  - `scheduleScreenChange(apply: () => void): void`
  - `resetTransitionBudgetForTests(): void`

`hold*` / `release*` 对各自租约幂等：第二次 `hold` 不再加计数，没有持有时 `release` 是空操作。`begin`/`end` 是原始计数，给测试直接用。`scheduleScreenChange` 调用 `holdScreenBudget()`，把 `apply` 接到同一帧队列（先登记的先执行），只排一个 rAF。`resetTransitionBudgetForTests` 取消未执行的 rAF、清计数和两个 hold 标记、去掉 class。

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginTransitionBudget,
  endTransitionBudget,
  holdFlightBudget,
  holdScreenBudget,
  isTransitionBudgetActive,
  releaseFlightBudget,
  releaseScreenBudget,
  resetTransitionBudgetForTests,
  scheduleScreenChange,
} from "./transition-budget";

afterEach(() => {
  resetTransitionBudgetForTests();
  vi.restoreAllMocks();
});

describe("transition budget", () => {
  it("keeps screen-moving until the last lease ends", () => {
    beginTransitionBudget();
    beginTransitionBudget();
    endTransitionBudget();
    expect(isTransitionBudgetActive()).toBe(true);
    expect(document.documentElement.classList.contains("screen-moving")).toBe(true);
    endTransitionBudget();
    expect(isTransitionBudgetActive()).toBe(false);
    expect(document.documentElement.classList.contains("screen-moving")).toBe(false);
  });

  it("does not increment a flight or screen lease twice", () => {
    holdFlightBudget();
    holdFlightBudget();
    releaseFlightBudget();
    expect(isTransitionBudgetActive()).toBe(false);
    holdScreenBudget();
    holdScreenBudget();
    releaseScreenBudget();
    expect(isTransitionBudgetActive()).toBe(false);
  });

  it("runs stacked screen changes on the next frame only", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const seen: string[] = [];
    scheduleScreenChange(() => seen.push("first"));
    scheduleScreenChange(() => seen.push("second"));
    expect(seen).toEqual([]);
    expect(isTransitionBudgetActive()).toBe(true);
    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(seen).toEqual(["first", "second"]);
  });

  it("ignores extra end calls and missing document", () => {
    endTransitionBudget();
    expect(isTransitionBudgetActive()).toBe(false);
    const html = document.documentElement;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });
    expect(() => {
      beginTransitionBudget();
      endTransitionBudget();
    }).not.toThrow();
    Object.defineProperty(globalThis, "document", descriptor ?? { configurable: true, value: { documentElement: html } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- src/lib/transition-budget.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: Write minimal implementation**

```ts
const CLASS = "screen-moving";

let leases = 0;
let flightHeld = false;
let screenHeld = false;
let pending: Array<() => void> = [];
let frame = 0;

function root() {
  return typeof document !== "undefined" ? document.documentElement : null;
}

function syncClass() {
  const html = root();
  if (!html) return;
  html.classList.toggle(CLASS, leases > 0);
}

export function isTransitionBudgetActive() {
  return leases > 0;
}

export function beginTransitionBudget() {
  leases += 1;
  syncClass();
}

export function endTransitionBudget() {
  if (leases === 0) return;
  leases -= 1;
  syncClass();
}

export function holdFlightBudget() {
  if (flightHeld) return;
  flightHeld = true;
  beginTransitionBudget();
}

export function releaseFlightBudget() {
  if (!flightHeld) return;
  flightHeld = false;
  endTransitionBudget();
}

export function holdScreenBudget() {
  if (screenHeld) return;
  screenHeld = true;
  beginTransitionBudget();
}

export function releaseScreenBudget() {
  if (!screenHeld) return;
  screenHeld = false;
  endTransitionBudget();
}

export function scheduleScreenChange(apply: () => void) {
  holdScreenBudget();
  pending.push(apply);
  if (frame) return;
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
  frame = raf(() => {
    frame = 0;
    const queue = pending;
    pending = [];
    for (const item of queue) item();
  }) as number;
}

export function resetTransitionBudgetForTests() {
  if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  frame = 0;
  pending = [];
  flightHeld = false;
  screenHeld = false;
  leases = 0;
  root()?.classList.remove(CLASS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npm test -- src/lib/transition-budget.test.ts`

Expected: PASS，4 个用例全绿。

- [ ] **Step 5: Commit only if the user asked.** Otherwise leave the working tree as-is and go to Task 2.

---

### Task 2: 书库切页分帧

**Files:**
- Modify: `client/src/store/useBooksStore.ts`
- Modify: `client/src/store/useBooksStore.test.ts`

**Interfaces:**
- Consumes: `scheduleScreenChange(apply: () => void): void` from Task 1
- Produces: `openBook` / `switchBookView` / `backToLibrary` 点击当帧不改 `view`，rAF 之后才改。`currentBook`、workspace 请求、`stopGenerating` 仍在点击帧执行。

把三处 `set({ view: ... })` 换成 `scheduleScreenChange(() => set({ view: ... }))`。`openBook` 里同一份 `set` 要拆开：`currentBook` / `sections` / loading 同步写，`view` 单独调度。

现有 `await openBook()` 用例依赖 `view` 已经变了。不要在 `beforeEach` 把 rAF 改成同步，否则新用例看不到当帧旧值。旧用例在读 `view` 前先抽一帧：

```ts
async function actFrame() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
```

`openBook` 本身不要 `await` rAF，避免把数据请求推迟一帧。

- [ ] **Step 1: Write the failing test**

在 `useBooksStore.test.ts` 的 describe 内、现有用例之前加入：

```ts
it("does not change view until the next frame", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  useBooksStore.setState({ books: [readyBook], view: "library" });
  const opening = useBooksStore.getState().openBook(readyBook.id, "book");
  expect(useBooksStore.getState().view).toBe("library");
  expect(useBooksStore.getState().currentBook?.id).toBe(readyBook.id);
  expect(frames).toHaveLength(1);
  frames[0](0);
  await opening;
  expect(useBooksStore.getState().view).toBe("book");
});
```

同一文件里，所有 `await openBook(...)` / `switchBookView(...)` / `backToLibrary()` 之后立刻读 `view` 的断言前，插入：

```ts
await actFrame();
```

其中：

```ts
async function actFrame() {
  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
    else finish();
  });
}
```

「does not change view」这条不要调用 `actFrame()`，只手动打 `frames[0]`。

需要改动的现有断言位置：

- `opens book space...`：两次 `openBook` 后的 `view === "book"`
- `prepares chat when the user changes...`：最后 `view === "workspace"`
- 文件后半 `await openBook("book-a")` 后期望 `view: "workspace"` 的那条
- `expect(useBooksStore.getState().view).toBe("library")` 若紧跟 `backToLibrary()`，同样 `actFrame()`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- src/store/useBooksStore.test.ts`

Expected: 新用例 FAIL，因为 `openBook` 仍在当帧 `set({ view: target })`。

- [ ] **Step 3: Write minimal implementation**

`useBooksStore.ts` 顶部增加：

```ts
import { scheduleScreenChange } from "@/lib/transition-budget";
```

`openBook` 中把：

```ts
set({
  view: target,
  currentBook: book,
  sections: [],
  readingProgress: null,
  assistant: null,
  isWorkspaceLoading: true,
  workspaceError: null,
});
```

改成：

```ts
set({
  currentBook: book,
  sections: [],
  readingProgress: null,
  assistant: null,
  isWorkspaceLoading: true,
  workspaceError: null,
});
scheduleScreenChange(() => set({ view: target }));
```

`switchBookView`：

```ts
scheduleScreenChange(() => set({ view: target }));
```

`backToLibrary`：

```ts
scheduleScreenChange(() => set({ view: "library" }));
```

`stopGenerating`、`flushSave`、workspace fetch 仍留在函数同步部分。`openBook` 在 fetch 结束后仍用 `get().view` 决定 `ensureBookChat` / `openReader`（测试「still-loading reader」依赖这一点，所以 rAF 必须在 fetch resolve 之前执行；测试里手动 `frames[0](0)` 或 `actFrame()` 保证这一点）。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npm test -- src/store/useBooksStore.test.ts`

Expected: PASS，含新的分帧用例和全部旧用例。

- [ ] **Step 5: Commit only if the user asked.**

---

### Task 3: App 侧页也分帧

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/App.auth-navigation.test.tsx`

**Interfaces:**
- Consumes: `scheduleScreenChange(apply: () => void): void`
- Produces: 账号 / 社区 / 塔罗 / 回首页 / 进入书库 这些会改 `resolveAppScreen` 输入的更新，都在下一帧提交。同一次点击里的多次 setState 必须进同一个 `scheduleScreenChange` 回调，不能各排一帧。

- [ ] **Step 1: Write the failing test**

`App.auth-navigation.test.tsx` 的 `expectScreen` 改成先抽一帧再查 DOM，防止分帧后 `waitFor` 在旧屏上误判超时。这不是新行为测试，是让现有导航测试在分帧后仍然稳定：

```ts
async function expectScreen(selector: string, absentSelector?: string) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    expect(container.querySelector(selector)).not.toBeNull();
    if (absentSelector) expect(container.querySelector(absentSelector)).toBeNull();
  });
}
```

再在 `transition-budget.test.ts` 加一条（侧页没有 store，用调度本身锁契约）：

```ts
it("keeps later screen changes on the same scheduled frame", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  let account = true;
  let entered = true;
  scheduleScreenChange(() => {
    account = false;
    entered = false;
  });
  expect(account).toBe(true);
  frames[0](0);
  expect(account).toBe(false);
  expect(entered).toBe(false);
});
```

- [ ] **Step 2: Run the new budget test (the App helper change should still pass today)**

Run: `cd client && npm test -- src/lib/transition-budget.test.ts src/App.auth-navigation.test.tsx`

Expected: budget 新用例 PASS；App 导航测试保持绿色。

- [ ] **Step 3: Wrap App screen setters**

`App.tsx` 增加：

```ts
import { scheduleScreenChange } from "@/lib/transition-budget";
```

`backToHomepage`：

```ts
const backToHomepage = () => {
  scheduleScreenChange(() => {
    useBooksStore.getState().backToLibrary();
    setAccountRoute(false);
    setCommunityRoute(false);
    setTarotRoute(false);
    setShowLogin(false);
    setHasEnteredApp(false);
  });
  if (window.location.hash === "#account" || window.location.hash === "#community" || window.location.hash === "#tarot")
    history.replaceState(history.state, "", window.location.pathname + window.location.search);
};
```

注意：`backToLibrary` 内部也会 `scheduleScreenChange`。Task 1 的实现是把回调推进同一 `pending` 队列、只排一个 rAF，所以回首页会在同一帧里先 `view=library` 再清路由，不会切两次。

`captureResetLink` 里三个 route setter 合成一次：

```ts
scheduleScreenChange(() => {
  setAccountRoute(window.location.hash === "#account");
  setCommunityRoute(window.location.hash === "#community");
  setTarotRoute(window.location.hash === "#tarot");
});
```

`LandingPage onEnter`：`scheduleScreenChange(() => setHasEnteredApp(true))`。

账号页 `onBack`、社区 `onBack`、塔罗 `onBack`、登录成功回调里所有改 `screen` 的 setState，同样包进**一个** `scheduleScreenChange`。重置密码页的 `onExit` / `onComplete` 会立刻离开 reset 路由，保持同步（reset 不走 `AppScreenStage`），不要分帧。

- [ ] **Step 4: Run App navigation tests**

Run: `cd client && npm test -- src/App.auth-navigation.test.tsx src/App.test.tsx src/lib/transition-budget.test.ts`

Expected: PASS。若 `expectScreen` 超时，检查是否有同步路径没包进 `scheduleScreenChange`，或 rAF 在 happy-dom 未触发——用 `act` + `requestAnimationFrame` 的 waitFor 即可，不要改成同步切页。

- [ ] **Step 5: Commit only if the user asked.**

---

### Task 4: 起飞降成本和飞行租约

**Files:**
- Modify: `client/src/lib/book-cover-flight.ts`
- Modify: `client/src/lib/book-cover-flight.test.ts`

**Interfaces:**
- Consumes: `holdFlightBudget()` / `releaseFlightBudget()`
- Produces: `freezeLook` 只给 `.book-cover-title` 和 `.book-cover-imprint` 写 inline 字号；`beginCoverFlight` 成功后 hold，`cancelCoverFlight` / `settleCover` 的 `finish` / `watchCoverFlight` 取消时 release。几何与同帧硬切换不变。

- [ ] **Step 1: Write the failing test**

在 `book-cover-flight.test.ts` 增加：

```ts
import { holdFlightBudget, isTransitionBudgetActive, resetTransitionBudgetForTests } from "./transition-budget";

afterEach(() => {
  resetTransitionBudgetForTests();
});

it("freezes only title and imprint styles and holds the flight budget", () => {
  const source = stubCover("shelf");
  source.innerHTML = `
    <span class="book-cover-title">长夜与春</span>
    <span class="book-cover-imprint">BookSoul Library</span>
    <span class="book-cover-spine"></span>
  `;
  const spine = source.querySelector(".book-cover-spine") as HTMLElement;
  const title = source.querySelector(".book-cover-title") as HTMLElement;
  title.style.fontSize = "22px";
  const computed = vi.spyOn(window, "getComputedStyle");
  beginCoverFlight(source);
  const flyer = document.querySelector(".book-cover-flyer") as HTMLElement;
  expect(isTransitionBudgetActive()).toBe(true);
  const scanned = computed.mock.calls.map((call) => (call[0] as Element).className);
  expect(scanned.some((name) => String(name).includes("book-cover-spine"))).toBe(false);
  expect(flyer.querySelector(".book-cover-title")).toMatchObject({ style: { fontSize: "22px" } });
  expect(spine.isConnected).toBe(true);
  cancelCoverFlight();
  expect(isTransitionBudgetActive()).toBe(false);
});
```

现有 `afterEach` 已调用 `cancelCoverFlight()`；再加上 `resetTransitionBudgetForTests()`，避免租约泄漏影响下一例。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- src/lib/book-cover-flight.test.ts`

Expected: 新用例 FAIL（`freezeLook` 仍遍历子孙，且没有 hold 预算）。旧几何用例应仍绿。

- [ ] **Step 3: Write minimal implementation**

`book-cover-flight.ts` 增加：

```ts
import { holdFlightBudget, releaseFlightBudget } from "./transition-budget";
```

替换 `freezeLook`：

```ts
function freezeLook(source: HTMLElement, flyer: HTMLElement) {
  const root = getComputedStyle(source);
  flyer.style.backgroundColor = root.backgroundColor;
  flyer.style.borderRadius = root.borderRadius;
  flyer.style.boxShadow = root.boxShadow;
  for (const name of ["book-cover-title", "book-cover-imprint"]) {
    const from = source.querySelector<HTMLElement>(`.${name}`);
    const to = flyer.querySelector<HTMLElement>(`.${name}`);
    if (!from || !to) continue;
    const style = getComputedStyle(from);
    to.style.fontSize = style.fontSize;
    to.style.fontFamily = style.fontFamily;
    to.style.lineHeight = style.lineHeight;
    to.style.letterSpacing = style.letterSpacing;
  }
}
```

`beginCoverFlight` 在 `active = { ... }` 之后调用 `holdFlightBudget()`。

`cancelCoverFlight` 在清 flyer 之后调用 `releaseFlightBudget()`。

`settleCover` 的 `finish`（显示落点并移除 flyer）里调用 `releaseFlightBudget()`。`landCoverFlight` 若因无 `animate` 或目标无尺寸直接 `finish()`，同样会 release。

`watchCoverFlight` 里所有 `cancelCoverFlight()` 分支已经 release，不要再 release 一次。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npm test -- src/lib/book-cover-flight.test.ts src/lib/transition-budget.test.ts`

Expected: PASS。特别检查「moves the clicked cover...」和取消路径仍绿。

- [ ] **Step 5: Commit only if the user asked.**

---

### Task 5: 整页入场租约

**Files:**
- Modify: `client/src/components/AppScreenStage.tsx`
- Modify: `client/src/components/AppScreenStage.test.tsx`

**Interfaces:**
- Consumes: `holdScreenBudget()` / `releaseScreenBudget()`
- Produces: 换 `screenKey` 时若还没有整页租约则 hold（`scheduleScreenChange` 通常已经 hold，此时幂等）。进入屏 `onAnimationComplete("center")` 时 release。`playedDuration` 为 0（HappyDOM / 减弱动效 / 首次挂载）在 layout 后立刻 release。卸载时 release。

首次挂载 `instant === true`：不要 hold；若 Task 2/3 已经 hold，首次挂载的 stage 也必须 release，否则预算永远不关。规则写成：

- 进入屏开始播放（`playEnter === true`）→ 确保 hold
- 进入结束或 `playEnter === false` → release

这样首次挂载会把导航调度留下的 screen 租约还掉，这是对的：没有入场动画时预算只服务封面飞行。

- [ ] **Step 1: Write the failing test**

`AppScreenStage.test.tsx` 增加：

```ts
import { holdScreenBudget, isTransitionBudgetActive, resetTransitionBudgetForTests } from "@/lib/transition-budget";

it("releases the screen budget when the entering pane finishes", async () => {
  resetTransitionBudgetForTests();
  holdScreenBudget();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <AppScreenStage screenKey="library" shift={shift}>
          <p>书架</p>
        </AppScreenStage>,
      );
    });
    expect(isTransitionBudgetActive()).toBe(false);

    holdScreenBudget();
    await act(async () => {
      root.render(
        <AppScreenStage screenKey="book" shift={{ ...shift, duration: 0 }}>
          <p>本书</p>
        </AppScreenStage>,
      );
    });
    expect(isTransitionBudgetActive()).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    resetTransitionBudgetForTests();
  }
});
```

现有「keeps the first screen settled」用例不要改行为。`duration: 0` 走 `playedDuration` 在 HappyDOM 已是 0，真实实现也必须在 0 时长时同步 release。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- src/components/AppScreenStage.test.tsx`

Expected: 新用例 FAIL（卸载/0 时长没有 release）。

- [ ] **Step 3: Write minimal implementation**

`AppScreenStage.tsx` 引入 `holdScreenBudget` / `releaseScreenBudget`。

`ScreenPane` 在现有 `onAnimationComplete` 里，`definition === "center"` 时除了 `release.current?.()` 再调用 `releaseScreenBudget()`。

增加：

```ts
useLayoutEffect(() => {
  if (playEnter && playedDuration(shift.duration) > 0) {
    holdScreenBudget();
    return () => releaseScreenBudget();
  }
  releaseScreenBudget();
  return undefined;
}, [playEnter, shift.duration]);
```

卸载 cleanup 调用 `releaseScreenBudget()`，幂等，不会把飞行租约误还。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npm test -- src/components/AppScreenStage.test.tsx src/lib/transition-budget.test.ts`

Expected: PASS。旧的双屏 present/inert 断言不变。

- [ ] **Step 5: Commit only if the user asked.**

---

### Task 6: 过渡中的便宜画法

**Files:**
- Modify: `client/src/theme/scenic-ui.css`（在 `.app-screen[data-present="false"]` 规则之后、`.scene-veil` 相关规则附近插入 `html.screen-moving` 块）
- Modify: `client/src/index.css`（`.glass` 旁）
- Modify: `client/src/components/CommunityChat/community-chat.css`（`.community-room` 的 `backdrop-filter` 旁）
- Modify: `client/src/theme/cssTokens.test.ts`

**Interfaces:**
- Consumes: `html.screen-moving` from Task 1
- Produces: 预算开启时关闭噪点、关掉 veil 720ms transition、固定背景滤镜图层、关闭所有现有 `backdrop-filter`、离开屏 `contain: paint`。不改饱和度数值，不新增第二套颜色。

- [ ] **Step 1: Write the failing test**

`cssTokens.test.ts` 增加读取 `scenic-ui.css` 和社区 CSS，并断言：

```ts
const scenic = readFileSync(resolve(__dirname, "./scenic-ui.css"), "utf8");
const community = readFileSync(resolve(__dirname, "../components/CommunityChat/community-chat.css"), "utf8");

it("paints cheaper layers while a screen is moving", () => {
  expect(scenic).toMatch(/html\.screen-moving\s+\.scenic-background img[\s\S]*contain:\s*paint/);
  expect(scenic).toMatch(/html\.screen-moving\s+\.scenic-background::after[\s\S]*opacity:\s*0/);
  expect(scenic).toMatch(/html\.screen-moving(?:\.veil-live)?\s+\.scene-veil::before[\s\S]*transition:\s*none/);
  expect(scenic).toMatch(/html\.screen-moving[\s\S]*backdrop-filter:\s*none/);
  expect(scenic).toMatch(/html\.screen-moving\s+\.app-screen\[data-present="false"\][\s\S]*contain:\s*paint/);
  expect(css).toMatch(/html\.screen-moving[\s\S]*\.glass[\s\S]*backdrop-filter:\s*none/);
  expect(community).toMatch(/html\.screen-moving[\s\S]*backdrop-filter:\s*none/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npm test -- src/theme/cssTokens.test.ts`

Expected: FAIL，选择器还不存在。

- [ ] **Step 3: Write the CSS**

`scenic-ui.css` 在 `.app-screen[data-present="false"]` 之后加入：

```css
html.screen-moving .scenic-background img {
  contain: paint;
  transform: translateZ(0);
}
html.screen-moving .scenic-background::after {
  opacity: 0;
}
html.screen-moving.veil-live .scene-veil::before,
html.screen-moving.veil-live .scene-veil::after {
  transition: none;
}
html.screen-moving .background-menu,
html.screen-moving .landing-copy,
html.screen-moving .dialog-scrim {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html.screen-moving .app-screen[data-present="false"] {
  contain: paint;
  content-visibility: auto;
}
```

`index.css` 的 `.glass` 规则后：

```css
html.screen-moving .glass {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
```

`community-chat.css` 在 `.community-paper` 的 `backdrop-filter: blur(18px)` 之后：

```css
html.screen-moving .community-paper {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
```

不要删除非预算状态下的 blur / saturate / 噪点规则。

- [ ] **Step 4: Run CSS and related tests**

Run: `cd client && npm test -- src/theme/cssTokens.test.ts src/lib/transition-budget.test.ts src/lib/book-cover-flight.test.ts src/components/AppScreenStage.test.tsx src/store/useBooksStore.test.ts src/lib/screen-transition.test.ts`

Expected: PASS。`screen-transition` 时长断言不变。

- [ ] **Step 5: Commit only if the user asked.**

---

### Task 7: 受影响包检查与手测清单

**Files:** 不新增文件。只跑检查并对照规格验收。

- [ ] **Step 1: Run the client quality gate**

Run: `cd client && npm run check`

Expected: lint、相关测试、`tsc`、build 退出码 0。若失败，只修本计划引入的问题，不顺手改无关文件。

- [ ] **Step 2: Manual verification**

在真实浏览器走：

1. 书架 → 本书空间 → 阅读 → 返回 → 对话 → 返回书架
2. 书架 ↔ 社区 / 塔罗 / 账号
3. 系统减弱动效开启时，封面不飞、预算不残留（过渡结束后玻璃模糊和噪点都在）

对照规格成功标准：点击后第一帧有起飞或位移；飞行中少掉帧；落定后雾面不二次变。

- [ ] **Step 3: Commit only if the user asked.**

---

## Self-review

| 规格条目 | 任务 |
| --- | --- |
| 预算计数 + `html.screen-moving` | Task 1 |
| 飞行租约 begin/end | Task 4 |
| 整页租约 begin/end，0 时长不泄漏 | Task 5 |
| 点击帧起飞、下一帧切页 | Task 2、3 |
| 连点合并到一个 rAF | Task 1 `pending` 队列 |
| `freezeLook` 只冻标题和署名 | Task 4 |
| 噪点 / veil transition / blur / contain | Task 6 |
| 减弱动效、超时取消、卸载还租约 | Task 4、5 |
| 不改飞行时长和 `screenShift` | 无任务改那些文件的数值 |
| 测试只锁契约 | 各任务测试；Task 7 不写 FPS 数字 |
