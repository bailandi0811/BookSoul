# BookSoul Claude 风格 UI 换肤设计

**日期：** 2026-07-22  
**状态：** 待用户审阅  
**范围：** 仅前端 `client/`（Design Tokens + 入场页 + 对话场壳层重塑）  
**前置：** 在 `2026-07-21-frontend-ui-optimization-design.md`（墨色书卷）已落地基础上，整体换肤为 Claude.ai 气质

## 背景与目标

现有 UI 为「墨色书卷」（暖纸、朱砂、衬线品牌字、文学壳层隐喻）。用户希望整体视觉向 [Claude.ai](https://claude.ai/) 靠拢：安静、暖象牙底、珊瑚橙强调、全面无衬线、大留白、宽侧栏对话壳。

**目标：**

1. 打开产品第一眼是 Claude 式平静对话产品，而不是书卷印章风。
2. 保留 BookSoul 选角入场与角色对话能力，不改成「打开即聊、无选角」。
3. 壳层文案平静短词；角色对话内容仍保持文学感。

## 已确认决策

| 项 | 选择 |
|----|------|
| 换肤深度 | A · 整体换肤（色板、字体、间距、气泡、侧栏、入场） |
| 入场 | A · 保留选角入场 |
| 主色 | A · 全面采用 Claude 式珊瑚橙 `#d97757` |
| 字体 | A · 全面无衬线 |
| 落地路径 | 方案 2 · Tokens + 关键组件重塑（不 1:1 重构产品级） |
| 入场布局 | A · 居中问候式；品牌加粗；角色选框加大 |
| 对话布局 | B · 宽侧栏（角色 + 会话）+ 居中对话列 + 大圆角输入条 |

## 视觉语言 / Design Tokens

### 气质

安静、暖、克制。靠留白与层级，不靠装饰与 glow。

### 色板（Light 为主）

| Token | 值 | 用途 |
|------|-----|------|
| `--background` | `#faf9f5` | 页面底（暖象牙） |
| `--foreground` | `#141413` | 主文字 |
| `--muted-foreground` | `#5e5d59` | 次要说明 |
| `--primary` | `#d97757` | 珊瑚橙：按钮、焦点、选中、发送 |
| `--primary-foreground` | `#faf9f5` | 主按钮文字 |
| `--secondary` / surface | `#f0eee6` | 侧栏、用户气泡浅底 |
| `--border` | `#e8e6dc` | 细线边框 |
| `--card` | `#ffffff` | 选角卡、输入条等抬升面 |

角色区分：同色系微差 + 名称/头像圆标；强调色统一珊瑚橙，避免朱砂/黛青彩虹块。

暗色参考（实施时可微调）：底 `#1a1917`、侧栏/次面 `#242220`、文字 `#f5f4ef`、边框 `#3a3835`；`--primary` 仍为 `#d97757`。

### 字体

- 全面无衬线：`Noto Sans SC`（英文可回退 system-ui / Inter）。
- 移除品牌/角色名对 `Noto Serif SC` 的依赖。
- 品牌与关键标题字重偏 **700**；正文约 400–500，行高约 `1.6–1.65`。

### 形状与深度

- 输入条 / 大气泡圆角约 `20–24px`；选角卡约 `16–18px`；按钮可用胶囊或中等圆角。
- 阴影极轻（输入条一层即可）；主要靠底色层级。
- **去掉：** 纸纹噪点、印章 seal、强 glow、大面积玻璃拟态、衬线英雄字。

### 暗色

保留开关：深暖灰底 + 珊瑚橙点缀。壳层不再使用「夜读纸」语义标签。

## 入场页 Entrance

**布局：居中问候式（A，已按反馈加粗加大）**

第一视口只做选角：

1. 英雄级品牌 **BookSoul**（无衬线、字重 700、字号显著）。
2. 一句支持文案（如「赋予书籍灵魂，与书中人对话」）。
3. 四个加大角色选框横排（头像圆标 + 姓名 + 短识）；选中态珊瑚橙描边。
4. 主 CTA：**开始对话**（珊瑚橙胶囊，字重加粗）；未选角色时默认书魂并允许进入（与现逻辑对齐，不另做强拦截）。

不做：统计条、能力罗列、技术卖点、书卷印章装饰。

## 对话场 Dialogue

**布局：宽侧栏 B**

### 侧栏（约 240px）

- 顶：BookSoul 字标 + 工具入口位。
- **＋ 新对话** 按钮。
- **角色** 列表（当前高亮珊瑚橙描边 + 头像）。
- **会话** 列表（当前会话浅底高亮）。
- 底：记忆、暗色等次要入口（平静短词）。

点角色默认开新会话（避免人格串戏）；切换前可确认——逻辑沿用现有，仅换肤。

### 主区

- Header：居中角色名（粗）+ 短识（muted）+「换角」。
- 对话列最大宽约 `680–720px`，水平居中。
- **用户消息：** 浅底（`--secondary`）圆角气泡，靠右。
- **AI 回复：** 无气泡纯文字；上方小标签显示角色名（珊瑚橙）。
- **引用卡 / 思考折叠：** 克制浅底细边，文案仍为「出自第 N 回」「沉吟」等角色向语义。
- **输入条：** 大圆角白底、轻阴影、占位「向{角色}提问…」、圆形珊瑚橙发送钮。

## 文案策略

| 层 | 策略 |
|----|------|
| 壳层 UI | Claude 式短词：「新对话」「角色」「会话」「记忆」「换角」 |
| 角色内容 | 保留文学感：开场白、沉吟等待、出自第 N 回、角色化占位符 |

废弃/降级书卷壳层标签（如「角色册」「书签」「夜读纸」）在主 UI 中的露出；产品叙事仍通过角色内容体现。

## 次要面

换角面板、记忆面板、引用卡、思考折叠、ConfirmDialog 等：同一套 token 重塑，**不改交互协议与后端**。

## 技术边界

- **只改** `client/`：`index.css` tokens、`index.html` 字体、`Entrance`、`BookChat/**`、`ui/*` 如需、角色元数据中的色/文案字段。
- **不改** Agent / SSE / 后端工具逻辑。
- **不** 取消选角入场；**不** 1:1 复制 Claude 品牌标识；**不** 重做立绘管线；**不** 新增多页营销路由。

## 主要触及文件（预期）

- `client/index.html` — 字体（去掉或停用衬线加载）
- `client/src/index.css` — token、utility（paper/seal/glow 清理或改写）
- `client/tailwind.config.js` — 语义色映射如需
- `client/src/components/Entrance/index.tsx` — 居中问候 + 大选框
- `client/src/components/BookChat/index.tsx` — 主壳 / Header
- `client/src/components/BookChat/components/Sidebar.tsx`
- `client/src/components/BookChat/components/MessageBubble.tsx`
- `client/src/components/BookChat/components/InputArea.tsx`
- `client/src/components/BookChat/components/ReferenceCard.tsx` 等次要面
- `client/src/data/characters.ts` — accent 对齐新 token

## 成功标准

1. 去侧栏后，第一屏仍是暖象牙 + 无衬线 BookSoul + 珊瑚橙 CTA，气质接近 Claude，而非朱砂书卷。
2. 对话场为宽侧栏 + 居中列 + 大圆角输入；AI 回复无气泡。
3. 选角入场仍在；角色切换与会话逻辑行为不变。
4. 壳层无书卷隐喻主标签；角色等待/引用文案仍文学向。

## 与 2026-07-21 设计的关系

本 spec **替换**该文档中的「墨色书卷」视觉语言与壳层隐喻；**保留**其信息架构（Entrance ↔ Dialogue、选角、换角开新会话）与 P2 体验坑清单（若尚未做完，可在实施计划中顺带或单列）。

## 非目标

- 不做 Claude 功能对标（Projects、Artifacts 等）。
- 不改后端 RAG / MCP。
- 本轮不强制清零全部 P2 体验坑（除非实施计划明确纳入）。

## 参考 mockup

本地 brainstorm 会话（`.superpowers/brainstorm/`，已 gitignore）：

- 入场 A 修订：`entrance-a-revised.html`
- 对话 B 详情：`dialogue-b-detail.html`
