# BookSoul Frontend UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端从通用 AI Chat 壳重构为「墨色书卷」气质的选角入场 + 角色对话场，并修好已知体验坑。

**Architecture:** 单应用两态（`entrance` | `dialogue`）由 Zustand 驱动；角色元数据集中在 `characters.ts`；主题 token/字体先落地，再改入场与对话壳；P2 修受控输入、双重 loading、abort 反馈等。不改后端 SSE/Agent。

**Tech Stack:** React 19、Zustand、Tailwind CSS 4、Framer Motion、Vite、Vitest（仅测纯逻辑）

**Spec:** `docs/superpowers/specs/2026-07-21-frontend-ui-optimization-design.md`

## Global Constraints

- 只改 `client/`；不改 Agent / SSE 协议 / 后端工具逻辑
- 主色：朱砂，禁止 Indigo/紫渐变主视觉；去掉强 glow
- 文案：少写「智能体 / 向量检索 / 知识库」；改用书卷隐喻
- 角色视觉 P1：姓氏印章 + 色，不强制立绘
- 换角默认新会话（`clearMessages`）；侧栏换角前可 `confirm`
- 暗色保留为「夜读纸」变体；P1 以浅色为准
- 工作目录：`client/`；包管理用项目现有（`pnpm` / `npm` 与仓库一致）

---

## File Structure

| 文件 | 职责 |
|------|------|
| `client/src/data/characters.ts` | 角色元数据（id/名/短识/色/文案） |
| `client/src/data/characters.test.ts` | 元数据单测 |
| `client/index.html` | title + 字体 CDN |
| `client/src/index.css` | 墨色 token、纸感、字体栈、弱化 glow |
| `client/src/store/useChatStore.ts` | `view`、`draftInput`、`switchCharacter`、`enterDialogue`、消息 `createdAt`、abort 标记 |
| `client/src/components/Entrance/index.tsx` | 选角入场页 |
| `client/src/components/BookChat/components/CharacterSwitchPanel.tsx` | 对话内轻量换角 |
| `client/src/App.tsx` | 按 `view` 切换 Entrance / BookChat |
| `client/src/components/BookChat/index.tsx` | Header/空状态/去掉外层 typing |
| `client/src/components/BookChat/components/Sidebar.tsx` | 角色册+书签+随身本事 |
| `client/src/components/BookChat/components/MessageBubble.tsx` | 印章头像、沉吟文案、时间戳 |
| `client/src/components/BookChat/components/ReferenceCard.tsx` | 「出自第 N 回」 |
| `client/src/components/BookChat/components/InputArea.tsx` | draftInput、角色占位符、停止样式 |
| `client/src/components/BookChat/components/MemoryPanel/*` | 「书中见闻」文案（若有 AI 记忆标题） |

---

### Task 1: 角色元数据模块

**Files:**
- Create: `client/src/data/characters.ts`
- Create: `client/src/data/characters.test.ts`
- Modify: `client/package.json`（加 vitest 脚本；若尚未安装则 `pnpm add -D vitest`）

**Interfaces:**
- Produces: `CharacterType`（从 store 再导出或在此定义并让 store 引用）、`CharacterProfile`、`CHARACTERS`、`getCharacter(id)`、`CHARACTER_IDS`

- [ ] **Step 1: 安装 vitest 并加脚本**

在 `client/` 执行：

```bash
pnpm add -D vitest
```

在 `client/package.json` 的 `scripts` 中加入：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: 写失败测试**

```ts
// client/src/data/characters.test.ts
import { describe, it, expect } from 'vitest';
import { CHARACTERS, getCharacter, CHARACTER_IDS } from './characters';

describe('characters', () => {
  it('exposes four character ids matching backend CharacterType', () => {
    expect(CHARACTER_IDS).toEqual(['assistant', 'qiaofeng', 'duanyu', 'wangyuyan']);
  });

  it('every character has required immersion fields', () => {
    for (const id of CHARACTER_IDS) {
      const c = getCharacter(id);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.shortTitle.length).toBeGreaterThan(0);
      expect(c.sealChar.length).toBe(1);
      expect(c.waitingText.length).toBeGreaterThan(0);
      expect(c.placeholder.length).toBeGreaterThan(0);
      expect(c.greeting.length).toBeGreaterThan(0);
      expect(c.suggestions.length).toBeGreaterThanOrEqual(2);
      expect(c.suggestions.length).toBeLessThanOrEqual(3);
      expect(c.accentCssVar).toMatch(/^--char-/);
    }
  });

  it('keeps email demo out of empty-state suggestions', () => {
    for (const id of CHARACTER_IDS) {
      for (const s of getCharacter(id).suggestions) {
        expect(s).not.toMatch(/@/);
      }
    }
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd client && pnpm test
```

Expected: FAIL（模块不存在或导出缺失）

- [ ] **Step 4: 实现 `characters.ts`**

```ts
// client/src/data/characters.ts
export type CharacterType = 'assistant' | 'qiaofeng' | 'duanyu' | 'wangyuyan';

export interface CharacterProfile {
  id: CharacterType;
  name: string;
  shortTitle: string;
  sealChar: string; // 姓氏印章一字
  accentCssVar: '--char-assistant' | '--char-qiaofeng' | '--char-duanyu' | '--char-wangyuyan';
  waitingText: string;
  thinkingLabel: string;
  thoughtDoneLabel: (steps: number) => string;
  placeholder: string;
  greeting: string;
  suggestions: string[];
}

export const CHARACTER_IDS: CharacterType[] = [
  'assistant',
  'qiaofeng',
  'duanyu',
  'wangyuyan',
];

export const CHARACTERS: Record<CharacterType, CharacterProfile> = {
  assistant: {
    id: 'assistant',
    name: '书灵',
    shortTitle: '《天龙八部》引路人',
    sealChar: '书',
    accentCssVar: '--char-assistant',
    waitingText: '书灵翻检书页…',
    thinkingLabel: '正在翻检书页…',
    thoughtDoneLabel: (n) => `已翻检书页（${n} 处）`,
    placeholder: '向书灵请教…',
    greeting: '书已展开。你想先问原著、地理，还是某一位英雄？',
    suggestions: [
      '乔峰在聚贤庄喝了几碗酒？',
      '无量山在现实中的什么地方？',
      '我现在在哪里？离大理有多远？',
    ],
  },
  qiaofeng: {
    id: 'qiaofeng',
    name: '乔峰',
    shortTitle: '丐帮帮主',
    sealChar: '乔',
    accentCssVar: '--char-qiaofeng',
    waitingText: '乔峰沉吟片刻…',
    thinkingLabel: '沉吟中…',
    thoughtDoneLabel: (n) => `沉吟完毕（${n} 步）`,
    placeholder: '向乔峰请教…',
    greeting: '有话不妨直说。是武功、江湖，还是兄弟义气？',
    suggestions: [
      '聚贤庄一事，你怎么看？',
      '降龙十八掌的精要是什么？',
      '你与段誉、虚竹的结义因何而起？',
    ],
  },
  duanyu: {
    id: 'duanyu',
    name: '段誉',
    shortTitle: '大理世子',
    sealChar: '段',
    accentCssVar: '--char-duanyu',
    waitingText: '段誉思索片刻…',
    thinkingLabel: '思索中…',
    thoughtDoneLabel: (n) => `思索完毕（${n} 步）`,
    placeholder: '与段誉闲谈…',
    greeting: '兄台有礼。可是要问凌波微步，还是大理风物？',
    suggestions: [
      '凌波微步如何习得？',
      '无量山剑湖宫是怎样的地方？',
      '你与王语嫣初次相遇是在何处？',
    ],
  },
  wangyuyan: {
    id: 'wangyuyan',
    name: '王语嫣',
    shortTitle: '曼陀山庄',
    sealChar: '王',
    accentCssVar: '--char-wangyuyan',
    waitingText: '王语嫣细细想来…',
    thinkingLabel: '查阅武学…',
    thoughtDoneLabel: (n) => `查阅完毕（${n} 处）`,
    placeholder: '向王语嫣请教武学…',
    greeting: '我记得不少门派招式。你想问哪一门？',
    suggestions: [
      '少林七十二绝技有哪些？',
      '姑苏慕容的「以彼之道」是何意？',
      '曼陀山庄种的是什么花？',
    ],
  },
};

export function getCharacter(id: CharacterType): CharacterProfile {
  return CHARACTERS[id];
}

/** 侧栏「随身本事」示例（含邮件），不进空状态 suggestions */
export const SIDE_ABILITIES = [
  { name: '古今对照', desc: '小说地名对照现实地理' },
  { name: '飞鸽传书', desc: '将片段寄至你的邮箱' },
  { name: '原著回响', desc: '回答有据时附章节出处' },
] as const;

export const QUICK_PROMPTS = [
  '我在哪里？',
  '乔峰是谁？',
  '把刚才那段发到我的邮箱',
] as const;
```

- [ ] **Step 5: 跑通测试**

```bash
cd client && pnpm test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/pnpm-lock.yaml client/src/data/characters.ts client/src/data/characters.test.ts
git commit -m "feat(client): add character immersion metadata module"
```

---

### Task 2: 墨色书卷主题 + 字体 + 页面标题

**Files:**
- Modify: `client/index.html`
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: 无
- Produces: CSS 变量 `--char-*`、`--font-display`、`--font-body`；纸感 `.paper-bg`

- [ ] **Step 1: 更新 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BookSoul</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600&family=Noto+Serif+SC:wght@500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 替换 `:root` / `.dark` token（墨色书卷）**

在 `client/src/index.css` 将 `:root` 改为（保留 `--radius`）：

```css
:root {
  --background: 247 243 236; /* 纸色 */
  --foreground: 28 25 23; /* 墨 */
  --card: 252 249 243;
  --card-foreground: 28 25 23;
  --popover: 252 249 243;
  --popover-foreground: 28 25 23;
  --primary: 166 45 45; /* 朱砂 */
  --primary-foreground: 255 252 248;
  --secondary: 235 228 216;
  --secondary-foreground: 55 48 40;
  --muted: 238 232 222;
  --muted-foreground: 110 98 86;
  --accent: 45 90 85; /* 黛青 */
  --accent-foreground: 255 252 248;
  --destructive: 180 50 50;
  --destructive-foreground: 255 252 248;
  --border: 214 204 188;
  --input: 214 204 188;
  --ring: 166 45 45;
  --radius: 12px;

  --font-display: 'Noto Serif SC', 'Songti SC', serif;
  --font-body: 'Noto Sans SC', system-ui, sans-serif;

  --char-assistant: 45 90 85;
  --char-qiaofeng: 166 45 45;
  --char-duanyu: 55 95 120;
  --char-wangyuyan: 140 85 70;
}
```

`.dark` 改为夜读纸（深墨底 + 略亮朱砂），例如：

```css
.dark {
  --background: 22 20 18;
  --foreground: 236 230 220;
  --card: 32 28 24;
  --card-foreground: 236 230 220;
  --popover: 36 32 28;
  --popover-foreground: 236 230 220;
  --primary: 196 72 72;
  --primary-foreground: 22 20 18;
  --secondary: 42 38 34;
  --secondary-foreground: 220 214 204;
  --muted: 42 38 34;
  --muted-foreground: 160 148 132;
  --accent: 70 120 112;
  --accent-foreground: 22 20 18;
  --destructive: 220 90 90;
  --destructive-foreground: 22 20 18;
  --border: 58 52 46;
  --input: 58 52 46;
  --ring: 196 72 72;
}
```

`body` 的 `font-family` 改为 `var(--font-body)`。

增加工具类：

```css
.font-display {
  font-family: var(--font-display);
}

.paper-bg {
  background-color: rgb(var(--background));
  background-image:
    radial-gradient(rgb(var(--foreground) / 0.03) 0.5px, transparent 0.5px);
  background-size: 3px 3px;
}

.seal-mark {
  font-family: var(--font-display);
  font-weight: 600;
  border: 1.5px solid currentColor;
  border-radius: 2px;
}
```

弱化或删除 `.avatar-gradient` 的紫渐变与 `.input-glow` 强光（改为朱砂极淡或删除 box-shadow glow）。

- [ ] **Step 3: 手动验证**

```bash
cd client && pnpm dev
```

打开页面：背景应为纸色，主按钮/链接偏朱砂，title 为 BookSoul，标题字可用 `.font-display` 试看。

- [ ] **Step 4: Commit**

```bash
git add client/index.html client/src/index.css
git commit -m "style(client): apply ink-paper theme and BookSoul fonts"
```

---

### Task 3: Store — view / 换角 / draftInput / createdAt / abort 标记

**Files:**
- Modify: `client/src/store/useChatStore.ts`
- Create: `client/src/store/useChatStore.view.test.ts`

**Interfaces:**
- Consumes: `CharacterType` from `@/data/characters`（store 内 `export type { CharacterType }` 再导出以兼容旧 import）
- Produces:
  - `view: 'entrance' | 'dialogue'`
  - `hasChosenCharacter: boolean`（localStorage 键 `booksoul_has_chosen`）
  - `draftInput: string` + `setDraftInput`
  - `enterDialogue(character: CharacterType)`
  - `switchCharacter(character: CharacterType, opts?: { confirm?: boolean })` — 清消息、新 session
  - `openEntrance()`
  - `Message.createdAt?: number`
  - `lastStopNotice: string | null` + `clearStopNotice`
  - `stopGenerating` 设置 `lastStopNotice: '对话已止'`

- [ ] **Step 1: 写失败测试（view 与换角）**

```ts
// client/src/store/useChatStore.view.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from './useChatStore';

describe('chat view & character switch', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState({
      view: 'entrance',
      messages: [],
      currentCharacter: 'assistant',
      draftInput: '',
      lastStopNotice: null,
      sessionId: 'session_test',
    });
  });

  it('enterDialogue sets view and character', () => {
    useChatStore.getState().enterDialogue('qiaofeng');
    const s = useChatStore.getState();
    expect(s.view).toBe('dialogue');
    expect(s.currentCharacter).toBe('qiaofeng');
  });

  it('switchCharacter clears messages and rotates sessionId', () => {
    useChatStore.setState({
      view: 'dialogue',
      messages: [{ role: 'user', content: 'hi', createdAt: 1 }],
      sessionId: 'session_old',
    });
    useChatStore.getState().switchCharacter('duanyu');
    const s = useChatStore.getState();
    expect(s.currentCharacter).toBe('duanyu');
    expect(s.messages).toEqual([]);
    expect(s.sessionId).not.toBe('session_old');
  });
});
```

- [ ] **Step 2: 跑测期望失败**

```bash
cd client && pnpm test
```

Expected: FAIL（方法不存在）

- [ ] **Step 3: 扩展 store（关键片段）**

1. `import type { CharacterType } from '@/data/characters'; export type { CharacterType };`
2. `Message` 增加 `createdAt?: number`
3. State 增加字段与方法如上
4. `addMessage` 时若无 `createdAt` 则 `Date.now()`
5. `enterDialogue`：`set({ view: 'dialogue', currentCharacter, ... }); localStorage.setItem('booksoul_has_chosen', '1')`
6. 初始 `view`：若 `localStorage.getItem('booksoul_has_chosen')` 则 `'dialogue'`，否则 `'entrance'`
7. `switchCharacter`：等同 `setCharacter` + `clearMessages`（新 sessionId）
8. `setCharacter` 可保留，但 UI 应优先用 `switchCharacter` / `enterDialogue`
9. `stopGenerating`：abort 后 `set({ lastStopNotice: '对话已止', isLoading: false })`（并 `finishStreaming` 若需要）
10. `draftInput` / `setDraftInput`

- [ ] **Step 4: 跑测通过**

```bash
cd client && pnpm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/store/useChatStore.ts client/src/store/useChatStore.view.test.ts
git commit -m "feat(client): add entrance view and character switch store APIs"
```

---

### Task 4: 入场页 Entrance

**Files:**
- Create: `client/src/components/Entrance/index.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `CHARACTERS` / `CHARACTER_IDS` / `getCharacter`；`enterDialogue`；`view`
- Produces: 入场 UI

- [ ] **Step 1: 实现 Entrance**

要求：
- 全屏 `paper-bg`
- 英雄级 `BookSoul`（`font-display` 大号）
- 一句：「赋予书籍灵魂，与书中人对话」
- 四个角色可选卡片（印章 + 名 + 短识）；本地 `useState` 选中
- CTA「开始对话」：未选禁用；点击 `enterDialogue(selected)`
- Framer：标题与卡片 stagger（y: 12 → 0）
- 无统计/能力堆砌

- [ ] **Step 2: 改 App.tsx**

```tsx
import BookChat from '@/components/BookChat';
import { Entrance } from '@/components/Entrance';
import { useChatStore } from '@/store/useChatStore';

function App() {
  const view = useChatStore((s) => s.view);
  return (
    <div className="h-screen w-full">
      {view === 'entrance' ? <Entrance /> : <BookChat />}
    </div>
  );
}

export default App;
```

- [ ] **Step 3: 手动验证**

刷新：先见入场 → 选乔峰 → 开始对话 → 进入聊天壳；再清 `localStorage` 应回入场。

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Entrance/index.tsx client/src/App.tsx
git commit -m "feat(client): add character entrance screen"
```

---

### Task 5: 对话场 Header + 空状态 + 换角面板入口

**Files:**
- Modify: `client/src/components/BookChat/index.tsx`
- Create: `client/src/components/BookChat/components/CharacterSwitchPanel.tsx`

**Interfaces:**
- Consumes: `currentCharacter`、`getCharacter`、`switchCharacter`、`openEntrance`（可选）、`sendMessage`、`messages`、`isLoading`

- [ ] **Step 1: CharacterSwitchPanel**

轻量面板/弹层：列出四角色；点击后 `window.confirm('更换角色将开启新的对话，是否继续？')` 为真则 `switchCharacter(id)` 并关闭。

- [ ] **Step 2: 重写 Header**

- 左侧：开侧栏按钮（保留）
- 中/左主信号：角色印章 + `font-display` 角色名 + `shortTitle`
- 右：`更换角色`（打开面板）、`新对话`（`clearMessages`）
- BookSoul 缩为小字角标（如右上或侧栏内），不抢角色
- 删除「智能体助手」与 Bot indigo 方块

- [ ] **Step 3: 空状态**

- 标题用 `greeting`；建议问题用 `suggestions`（素色书签条，无彩色 icon 卡）
- 点击 `sendMessage(text)`
- 去掉「开启智能探索之旅 / 智能体 / 向量」文案
- 去掉邮件 `@` 建议

- [ ] **Step 4: 去掉外层 typing 三点气泡**

若 `BookChat` 底部在 `isLoading` 且最后一条是 user 时另渲染 typing 指示器——**删除它**，只保留气泡内沉吟态（P2 合并等待态的一部分提前做掉）。

- [ ] **Step 5: 手动验证**

选角进对话：Header 显示乔峰；空状态三条建议；换角确认后消息清空且 Header 变段誉。

- [ ] **Step 6: Commit**

```bash
git add client/src/components/BookChat/index.tsx client/src/components/BookChat/components/CharacterSwitchPanel.tsx
git commit -m "feat(client): character-centric dialogue header and empty state"
```

---

### Task 6: Sidebar 角色册 + 书签 + 文案

**Files:**
- Modify: `client/src/components/BookChat/components/Sidebar.tsx`
- Modify: `client/src/components/BookChat/components/MemoryPanel/index.tsx`（若标题含「AI 记忆」改为「书中见闻」）

**Interfaces:**
- Consumes: `CHARACTERS`、`SIDE_ABILITIES`、`QUICK_PROMPTS`、`switchCharacter`、`setDraftInput`

- [ ] **Step 1: 替换本地 CHARACTERS / CAPABILITIES**

- 顶栏：书名《天龙八部》+ BookSoul 小标；副文案改「书魂对话」，去掉「智能体助手」与 Bot 渐变块
- 「选择角色」→「角色册」；用印章字代替 emoji；点击走 `confirm` + `switchCharacter`
- 「历史对话」→「书签」
- 「挂载能力」→「随身本事」，用 `SIDE_ABILITIES` 素色列表（无 emerald/violet 彩虹）
- 快捷指令：`setDraftInput(text)` 替代直接改 DOM
- 隐藏或删除无功能的「系统设置」「使用帮助」按钮（P2 要求：隐藏）
- MemoryPanel 标题：「书中见闻」

- [ ] **Step 2: 手动验证**

快捷指令应填入输入框可见文本；设置/帮助不可见。

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BookChat/components/Sidebar.tsx client/src/components/BookChat/components/MemoryPanel/index.tsx
git commit -m "feat(client): restyle sidebar as character booklet"
```

---

### Task 7: MessageBubble + ReferenceCard 书卷隐喻

**Files:**
- Modify: `client/src/components/BookChat/components/MessageBubble.tsx`
- Modify: `client/src/components/BookChat/components/ReferenceCard.tsx`

**Interfaces:**
- Consumes: `useChatStore.currentCharacter`、`getCharacter`

- [ ] **Step 1: MessageBubble**

- 助手头像：`.seal-mark` 显示 `sealChar`，颜色 `rgb(var(--char-xxx))`
- 思考中文案：`thinkingLabel` / `thoughtDoneLabel(n)`，替换「深度思考」
- 无 steps 且 streaming 空内容时的占位：用 `waitingText`，不用「AI正在思考中」
- 时间戳：`message.createdAt` → `toLocaleTimeString`；若无则不显示或显示空

- [ ] **Step 2: ReferenceCard**

文案改为：`出自《{book}》第 {chapter_num} 回`（多条时「等 N 处」）；去掉「知识库引用」。

- [ ] **Step 3: 手动验证**

触发带 thinking / references 的问答，检查文案与印章。

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BookChat/components/MessageBubble.tsx client/src/components/BookChat/components/ReferenceCard.tsx
git commit -m "feat(client): literary metaphors for thinking and citations"
```

---

### Task 8: InputArea — 占位符、draftInput、停止样式、底栏文案

**Files:**
- Modify: `client/src/components/BookChat/components/InputArea.tsx`

**Interfaces:**
- Consumes: `draftInput`、`setDraftInput`、`currentCharacter`、`getCharacter`、`lastStopNotice`、`clearStopNotice`

- [ ] **Step 1: 受控输入与 store 同步**

- 优先用 store `draftInput` 作为 value（或本地 state 与 `draftInput` 双向同步：`useEffect` 在 `draftInput` 变化时写入）
- `placeholder={getCharacter(currentCharacter).placeholder}`
- 发送成功后 `setDraftInput('')`
- 停止按钮：朱砂描边 / 墨底，去掉 `from-red-500 to-red-600` 大渐变
- 发送按钮：实心 `bg-primary`，弱化 glow
- 底栏：「言出有据处，皆引自原著」
- 若 `lastStopNotice`：在输入区上方显示一行，3s 后 `clearStopNotice`

- [ ] **Step 2: 手动验证**

侧栏快捷指令填入可见；停止后出现「对话已止」；占位符随角色变。

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BookChat/components/InputArea.tsx
git commit -m "feat(client): character placeholders and controlled draft input"
```

---

### Task 9: P2 收尾核对 + 构建验证

**Files:**
- 按需小改上述文件（双重 loading、时间戳、title 等若未完成则补齐）

- [ ] **Step 1: 对照清单逐项打勾**

| 项 | 期望 |
|----|------|
| 无双重 loading | 仅气泡内沉吟 |
| 快捷指令 | 受控填入 |
| Settings/Help | 已隐藏 |
| Abort 反馈 | 「对话已止」 |
| 时间戳 | `createdAt` |
| title | BookSoul |
| 空状态无 `@` | 邮件仅在随身本事/快捷 |

- [ ] **Step 2: 类型与构建**

```bash
cd client && pnpm test && pnpm build
```

Expected: tests PASS；`tsc -b && vite build` 成功

- [ ] **Step 3: Commit（若有收尾改动）**

```bash
git add -u client
git commit -m "fix(client): finish UI polish checklist"
```

---

## Self-Review (against spec)

| Spec 要求 | Task |
|-----------|------|
| 墨色 token + 字体 | Task 2 |
| 入场选角 | Task 4 |
| view 状态 | Task 3 |
| Header 角色英雄级 | Task 5 |
| 侧栏角色册/书签/文案 | Task 6 |
| 印章/沉吟/出处 | Task 7 |
| 输入占位/停止样式 | Task 8 |
| 换角新会话 | Task 3 + 5/6 |
| P2 体验坑 | Task 3/5/6/8/9 |
| 不改后端 | Global Constraints |

无 TBD/占位；`CharacterType` 统一自 `characters.ts` 再导出。
