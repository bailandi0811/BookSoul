# BookSoul Claude-Style UI Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端从「墨色书卷」整体换肤为 Claude.ai 气质（暖象牙 + 珊瑚橙 + 全面无衬线），保留选角入场与宽侧栏对话场。

**Architecture:** 先替换 Design Tokens / 字体，再重塑 Entrance（居中问候 + 大选框），再改 Sidebar / Header / MessageBubble / InputArea 与壳层文案；角色文学向文案保留。不改后端 SSE/Agent。

**Tech Stack:** React 19、Zustand、Tailwind CSS 4、Framer Motion、Vite、Vitest

**Spec:** `docs/superpowers/specs/2026-07-22-claude-style-ui-reskin-design.md`

## Global Constraints

- 只改 `client/`；不改 Agent / SSE / 后端
- 主色珊瑚橙 `#d97757` → RGB `217 119 87`；背景暖象牙 `#faf9f5` → `250 249 245`
- 全面无衬线；去掉 `font-display` / `Noto Serif SC` 作为品牌与角色标题
- 壳层文案用短词：「新对话」「角色」「会话」「记忆」「换角」「暗色」；废弃「角色册」「书签」「夜读纸」「书中见闻」等主露出
- 角色内容保留：沉吟 / 出自第 N 回 / 角色占位与开场白
- 入场保留选角；默认选中 `assistant`（书魂）
- 对话：宽侧栏 ~240px；AI 无气泡；用户浅底气泡；输入条大圆角
- 工作目录：`client/`；用仓库现有包管理（`pnpm` / `npm`）
- Commit 步骤：仅在用户允许提交时执行；否则跳过 commit step，保留工作区改动

---

## File Structure

| 文件 | 职责 |
|------|------|
| `client/index.html` | 仅加载 Noto Sans SC（含 700） |
| `client/src/index.css` | Claude token、清理 paper/seal/glow、avatar utility |
| `client/tailwind.config.js` | `font-sans` → Noto Sans SC；弱化 glow |
| `client/src/data/characters.ts` | 角色 accent 对齐暖色微差 |
| `client/src/data/characters.test.ts` | 元数据单测（可微调） |
| `client/src/theme/cssTokens.test.ts` | 断言 CSS 含新 primary/background RGB |
| `client/src/components/Entrance/index.tsx` | 居中问候 + 横排大选框 |
| `client/src/components/BookChat/index.tsx` | 去 paper；Header 居中；空状态无衬线 |
| `client/src/components/BookChat/components/Sidebar.tsx` | 宽侧栏结构 + 新对话 + 壳层文案 |
| `client/src/components/BookChat/components/MessageBubble.tsx` | 用户浅气泡；AI 无气泡 |
| `client/src/components/BookChat/components/InputArea.tsx` | 大圆角白底输入条 |
| `client/src/components/BookChat/components/CharacterSwitchPanel.tsx` | token/文案对齐 |
| `client/src/components/BookChat/components/MemoryPanel/index.tsx` | 「记忆」标题 |
| `client/src/components/BookChat/components/ReferenceCard.tsx` | 克制边框（按需） |

---

### Task 1: Design Tokens + 字体

**Files:**
- Modify: `client/index.html`
- Modify: `client/src/index.css`
- Modify: `client/tailwind.config.js`
- Create: `client/src/theme/cssTokens.test.ts`
- Modify: `client/src/data/characters.ts`（char accent RGB）

**Interfaces:**
- Produces: `:root` / `.dark` 新 RGB token；`--font-body` 唯一正文字体；`.avatar-mark` 替代印章视觉；`--char-*` 暖色微差
- Consumes: 现有 Tailwind `rgb(var(--*) / <alpha>)` 映射（保持不变）

- [ ] **Step 1: 写失败测试（token 字符串）**

```ts
// client/src/theme/cssTokens.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

describe('claude-style css tokens', () => {
  it('uses coral primary and ivory background in :root', () => {
    expect(css).toMatch(/--primary:\s*217\s+119\s+87/);
    expect(css).toMatch(/--background:\s*250\s+249\s+245/);
    expect(css).toMatch(/--foreground:\s*20\s+20\s+19/);
  });

  it('does not keep vermillion primary as default', () => {
    expect(css).not.toMatch(/--primary:\s*166\s+45\s+45/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd client && npm test -- src/theme/cssTokens.test.ts`
Expected: FAIL（文件不存在或断言不匹配）

- [ ] **Step 3: 更新 `index.html` 字体**

将 Google Fonts link 改为只加载 Sans，并含 700：

```html
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

删除 `Noto+Serif+SC` 参数。

- [ ] **Step 4: 替换 `index.css` 的 `:root` / `.dark` 与关键 utility**

将 `:root` 改为（保留其余非冲突规则，按需改写）：

```css
:root {
  --background: 250 249 245;
  --foreground: 20 20 19;
  --card: 255 255 255;
  --card-foreground: 20 20 19;
  --popover: 255 255 255;
  --popover-foreground: 20 20 19;
  --primary: 217 119 87;
  --primary-foreground: 250 249 245;
  --secondary: 240 238 230;
  --secondary-foreground: 61 61 58;
  --muted: 240 238 230;
  --muted-foreground: 94 93 89;
  --accent: 217 119 87;
  --accent-foreground: 250 249 245;
  --destructive: 180 50 50;
  --destructive-foreground: 250 249 245;
  --border: 232 230 220;
  --input: 232 230 220;
  --ring: 217 119 87;
  --radius: 18px;

  --font-display: 'Noto Sans SC', system-ui, sans-serif;
  --font-body: 'Noto Sans SC', system-ui, sans-serif;

  /* 角色微差：同暖色系，避免彩虹 */
  --char-assistant: 180 130 110;
  --char-qiaofeng: 217 119 87;
  --char-duanyu: 160 120 100;
  --char-wangyuyan: 190 140 115;
}
```

`.dark`：

```css
.dark {
  --background: 26 25 23;
  --foreground: 245 244 239;
  --card: 36 34 32;
  --card-foreground: 245 244 239;
  --popover: 36 34 32;
  --popover-foreground: 245 244 239;
  --primary: 217 119 87;
  --primary-foreground: 250 249 245;
  --secondary: 36 34 32;
  --secondary-foreground: 245 244 239;
  --muted: 36 34 32;
  --muted-foreground: 176 174 165;
  --accent: 217 119 87;
  --accent-foreground: 250 249 245;
  --destructive: 220 90 90;
  --destructive-foreground: 250 249 245;
  --border: 58 56 53;
  --input: 58 56 53;
  --ring: 217 119 87;
}
```

将 `.paper-bg` 改为纯底色（去掉噪点）：

```css
.paper-bg {
  background-color: rgb(var(--background));
}
```

将 `.seal-mark` 改写为圆形 avatar（或新增 `.avatar-mark` 并全局替换 class）：

```css
.avatar-mark {
  font-family: var(--font-body);
  font-weight: 700;
  border-radius: 9999px;
  background: rgb(var(--secondary));
  border: 1px solid rgb(var(--border));
  color: inherit;
}
```

全局把 `seal-mark` 替换为 `avatar-mark`（本 task 改 CSS；组件替换在后续 task 一并做也可以，但建议本 task 保留 `.seal-mark` 为 `.avatar-mark` 的别名以免中间态破碎：

```css
.seal-mark {
  /* alias → avatar-mark during migration */
  font-family: var(--font-body);
  font-weight: 700;
  border-radius: 9999px;
  background: rgb(var(--secondary));
  border: 1px solid rgb(var(--border));
}
```

弱化 `.soft-surface` 阴影（去掉重 blur 玻璃感），改为轻边框白/次面。

- [ ] **Step 5: 更新 `tailwind.config.js` fontFamily.sans**

```js
sans: ['"Noto Sans SC"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
```

可将 `glow` / `glow-lg` 改为极轻阴影或删除未用引用。

- [ ] **Step 6: 跑 token 测试**

Run: `cd client && npm test -- src/theme/cssTokens.test.ts`
Expected: PASS

- [ ] **Step 7: 目视**

Run: `cd client && npm run dev`  
打开入场/对话：底应为暖象牙，主按钮/焦点偏珊瑚橙（组件未全改时部分仍可能带旧布局）。

- [ ] **Step 8: Commit（若用户允许）**

```bash
git add client/index.html client/src/index.css client/tailwind.config.js client/src/theme/cssTokens.test.ts
git commit -m "style: adopt Claude-like design tokens and sans font"
```

---

### Task 2: Entrance 居中问候式

**Files:**
- Modify: `client/src/components/Entrance/index.tsx`

**Interfaces:**
- Consumes: `CHARACTER_IDS`、`getCharacter`、`enterDialogue`、`primary` tokens
- Produces: 默认 `selected = 'assistant'`；横排大选框；无衬线粗标题

- [ ] **Step 1: 重写 Entrance 布局（完整替换组件 return 结构）**

关键要求（实现时写入文件）：

```tsx
// 默认选中书魂
const [selected, setSelected] = useState<CharacterType>('assistant');

// 外层：min-h-screen bg-background，居中 flex-col，去掉装饰径向渐变或极淡
// 标题：text-5xl sm:text-6xl font-bold tracking-tight（不要 font-display）
// 副文：text-muted-foreground font-medium
// 角色：flex flex-wrap justify-center gap-3；每卡 w-[96px] sm:w-[104px] 竖排
//   头像：avatar-mark / seal-mark 圆形 w-9 h-9
//   名 font-bold；短识 text-[11px] text-muted-foreground
//   选中：border-2 border-primary bg-card；未选：border border-border bg-secondary
// CTA：rounded-full bg-primary text-primary-foreground font-bold px-9 py-3.5
//   onClick={() => enterDialogue(selected)} — selected 始终有值
```

删除：`disabled={!selected}`、2×2 `grid`、`font-display`、衬线感 tracking-wide 书卷样式。

- [ ] **Step 2: 目视验收**

- 品牌粗、居中
- 四角色横排、选框明显大于旧版
- 默认书魂已选；点「开始对话」进入对话

- [ ] **Step 3: Commit（若用户允许）**

```bash
git add client/src/components/Entrance/index.tsx
git commit -m "style: restyle entrance as Claude-like centered picker"
```

---

### Task 3: Sidebar 宽侧栏 + 壳层文案

**Files:**
- Modify: `client/src/components/BookChat/components/Sidebar.tsx`
- Modify: `client/src/components/BookChat/components/MemoryPanel/index.tsx`
- Modify: `client/src/components/BookChat/components/CharacterSwitchPanel.tsx`（确认文案「书签」→「会话」）

**Interfaces:**
- Consumes: `clearMessages`、`switchCharacter`、`sessions`、`fetchSessions`、`loadSession`、`deleteSession`
- Produces: 顶栏 BookSoul；「＋ 新对话」；分区「角色」「会话」；底「暗色」；记忆标题「记忆」

- [ ] **Step 1: 从 store 取 `clearMessages`，在侧栏顶增加新对话按钮**

在 `Sidebar` 解构中加入 `clearMessages`。

在品牌行下方加入：

```tsx
<button
  type="button"
  onClick={() => clearMessages()}
  className="w-full mb-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-secondary/80"
>
  ＋ 新对话
</button>
```

- [ ] **Step 2: 替换壳层文案与结构 class**

| 旧 | 新 |
|----|-----|
| 《天龙八部》主标题 | **BookSoul**（`font-bold text-base`） |
| 书魂对话副标题 | 可删或改为极短「天龙八部」muted |
| 角色册 | **角色** |
| 书签 / 暂无书签 / 删除书签 | **会话** / 暂无会话 / 删除会话 |
| 夜读纸 / 日间纸色 | **暗色** / **浅色** |
| ConfirmDialog「书签」 | 「会话」 |

侧栏容器：

```tsx
<div className="flex flex-col h-full w-full bg-secondary border-r border-border">
```

（父级若控制宽度，确保对话壳侧栏约 `w-60` / `240px`；在 `BookChat/index.tsx` 把侧栏宽度类改为 `w-60`。）

角色项选中：`border border-primary bg-card`；头像用圆形 mark，颜色可用 `text-primary` 或 `rgb(var(${char.accentCssVar}))` 但避免大色块。

- [ ] **Step 3: MemoryPanel 标题**

将「书中见闻」改为「记忆」（文件：`MemoryPanel/index.tsx`）。

- [ ] **Step 4: CharacterSwitchPanel**

去掉 `font-display`；`seal-mark` 保持圆形 alias；Confirm 文案「书签」→「会话」。

- [ ] **Step 5: 目视**

侧栏宽、文案为「角色/会话/新对话/暗色」；新对话清空当前消息；换角确认仍可用。

- [ ] **Step 6: Commit（若用户允许）**

```bash
git add client/src/components/BookChat/components/Sidebar.tsx client/src/components/BookChat/components/MemoryPanel/index.tsx client/src/components/BookChat/components/CharacterSwitchPanel.tsx client/src/components/BookChat/index.tsx
git commit -m "style: restyle sidebar to Claude-like wide nav"
```

---

### Task 4: 对话主区 — Header / 气泡 / 输入

**Files:**
- Modify: `client/src/components/BookChat/index.tsx`
- Modify: `client/src/components/BookChat/components/MessageBubble.tsx`
- Modify: `client/src/components/BookChat/components/InputArea.tsx`
- Modify: `client/src/components/BookChat/components/ReferenceCard.tsx`（轻量）

**Interfaces:**
- Consumes: tokens、`getCharacter`
- Produces: 居中 Header；用户 `bg-secondary` 气泡；AI 无卡片气泡；输入条 `rounded-3xl` 白底轻阴影

- [ ] **Step 1: BookChat 壳**

- 外层：`bg-background`（可保留 `paper-bg` 因已无噪点）
- 侧栏列宽：`w-60`（展开时）
- Header：内容水平居中 — 角色名 `font-bold`、短识 muted、「换角」`text-primary font-semibold`；去掉或弱化左侧大 seal 抢视线（可保留小圆形 avatar）
- 消息区：`max-w-[720px] mx-auto`
- 空状态：去掉 `font-display`；圆形 avatar；建议问题素色列表

- [ ] **Step 2: MessageBubble**

用户：

```tsx
className="bg-secondary text-foreground rounded-[20px] px-4 py-3 text-[15px] leading-relaxed"
// 不要 bg-foreground 反色块
```

AI：

```tsx
// 去掉 bg-card border rounded 气泡壳
<div className="w-full max-w-none">
  <div className="text-xs font-bold text-primary mb-2">{character.name}</div>
  <div className="prose-ai text-[15px] leading-[1.65]">{/* markdown */}</div>
</div>
```

AI 左侧大印章可改为小圆形或去掉（Claude 味：常无助手头像）；推荐保留小 `w-7 h-7` 圆标以免丢角色感。

思考折叠 / 引用：保持浅底细边，不要重阴影。

- [ ] **Step 3: InputArea**

容器：

```tsx
<div className="mx-auto max-w-[720px] px-4 pb-5">
  <form className="flex items-end gap-3 rounded-3xl border border-border bg-card px-4 py-3 shadow-[0_2px_16px_rgba(20,20,19,0.05)]">
    {/* textarea 无边框 bg-transparent */}
    {/* 发送：圆形 w-8 h-8 bg-primary text-primary-foreground */}
  </form>
</div>
```

停止按钮：描边 `border-border`，不要大红渐变。

- [ ] **Step 4: ReferenceCard**

保持「出自第 N 回」文案；样式改为 `bg-secondary/80 border border-border rounded-xl`，去掉花哨强调。

- [ ] **Step 5: 跑已有单测**

Run: `cd client && npm test`
Expected: PASS（characters / view tests）

- [ ] **Step 6: 目视完整对话流**

发一条消息：用户浅气泡靠右；AI 无气泡；输入条大圆角；Header 居中。

- [ ] **Step 7: Commit（若用户允许）**

```bash
git add client/src/components/BookChat/
git commit -m "style: restyle chat main pane like Claude composer"
```

---

### Task 5: 扫尾与回归

**Files:**
- Modify: 任何仍含 `font-display`、书卷壳层文案、朱砂硬编码的 `client/src/**`
- Verify: `client/src/theme/cssTokens.test.ts`、`characters.test.ts`

- [ ] **Step 1: ripgrep 检查**

```bash
cd client && rg -n "角色册|书签|夜读纸|书中见闻|日间纸色|Noto Serif|font-display" src index.html
```

Expected: 壳层主 UI 无上述文案；`font-display` 若仍指向 Sans 可留，但组件上尽量改用 `font-bold`/`font-sans`。角色文学文案（沉吟等）应保留。

- [ ] **Step 2: 全量测试**

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 3: 成功标准核对（对照 spec）**

1. 入场：暖象牙 + 粗无衬线 BookSoul + 珊瑚橙 CTA + 大选框横排  
2. 对话：宽侧栏 + 居中列 + 大输入；AI 无气泡  
3. 选角入场仍在；换角/会话逻辑可用  
4. 壳层短词；角色等待/引用仍文学向  

- [ ] **Step 4: Commit（若用户允许）**

```bash
git add client/
git commit -m "style: finish Claude-like UI reskin sweep"
```

---

## Self-Review (plan author)

| Spec 项 | Task |
|---------|------|
| Tokens 象牙/珊瑚橙/暗色 | Task 1 |
| 全面无衬线 | Task 1–2 |
| 入场 A 居中+加粗加大+默认书魂 | Task 2 |
| 对话 B 宽侧栏 | Task 3 |
| 用户浅气泡 / AI 无气泡 / 大输入 | Task 4 |
| 壳层文案短词 | Task 3–5 |
| 次要面 Memory/换角/引用 | Task 3–4 |
| 不改后端 | Global Constraints |

无 TBD。Commit 步骤受用户「是否允许提交」约束，与 Global Constraints 一致。
