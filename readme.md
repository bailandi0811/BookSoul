# BookSoul (书魂)

> **赋予书籍灵魂，与书中人物跨越时空对话。**

## 项目简介

BookSoul 是一个基于 **Agentic RAG** (基于智能体的检索增强生成) 与 MCP (模型上下文协议) 技术的沉浸式文学对话系统。它不仅是一个简单的问答机器人，而是一个能 **感知上下文、自主规划路由、调用外部工具、并以特定“人格”与用户进行深度交互** 的复杂 AI Agent 系统。

本项目以金庸的《天龙八部》为载体，实现了与书中角色的“灵魂对话”。得益于 Agentic RAG 架构，它拥有极高的响应速度与准确性：在日常闲聊时能瞬间秒回；而在深入探讨原著时，又能触发复杂的 **CRAG (纠错型 RAG)** 流程进行深度检索。

## 核心功能

- **Agentic RAG 智能路由**: 彻底告别传统 RAG 无脑检索的弊端。Agent 能够自主判断用户意图（日常问候 vs 原著探讨），智能决定是否需要调用沉重的向量检索工具，极大提升了响应速度。
- **CRAG (纠错型检索)**: 当触发原著检索时，内置的专家工具会自动进行“查询重写 -> 检索 -> 结果批判 -> 失败重试”的深度思考循环，确保回答的准确度，杜绝大模型“幻觉”。
- **沉浸式角色对话**: 结合原著性格与经历，动态切换并模拟书中人物（如乔峰、段誉、王语嫣）与读者进行对话。
- **MCP 实景云游 (Tools)**: 集成高德地图 API，当对话涉及地理位置（如“无量山”、“燕子坞”）时，自动关联现实世界的地理信息，提供位置查询和实景描述。
- **MCP 智能网络感知 (Tools)**: 当用户询问“我在哪”或需要获取网络信息时，Agent 会自动调用 `mcp-server-fetch` 外部工具，灵活请求定位 API（如 ip-api），感知用户真实地理位置并以角色口吻互动。
- **邮件发送服务 (Tools)**: 支持将小说片段、武功秘籍或对话内容一键通过邮件（SMTP）发送至用户指定邮箱。
- **动态思考 UI (Thinking State)**: 媲美 ChatGPT 的精美前端体验，在 Agent 检索或调用工具时，展示优雅的“思考中”动画与发光效果。
- **流式中断机制**: 支持随时通过前端中止正在生成或思考中的 Agent 任务，及时释放前后端资源。
- **持久化短期记忆 (Memory)**: 引入基于 FileSystem 的会话记忆机制，自动按 Session 隔离对话，并采用滑动窗口截断策略精准控制 Token 消耗，实现丝滑的“断点续聊”。
- **双 Token 账号体系**: 支持注册、登录、Access Token 自动刷新、Refresh Token 安全轮换，以及当前设备和全部设备登出。
- **Guest 数据认领**: 访客登录后可将当前会话、画像、长期记忆和 Milvus 向量归属安全迁移到账号。
- **身份归属隔离**: 聊天历史与记忆接口只信任服务端解析的 User/Guest 身份，客户端无法通过伪造 `userId` 越权访问。

## 技术架构

### 核心架构：基于 LangGraph 的 ReAct Agent

BookSoul 抛弃了简单的线性链，采用了基于 `@langchain/langgraph` 的有向图状态机架构：

- **大脑 (LLM)** : 使用 LangChain 框架集成 OpenAI 兼容模型 (如 GPT-4/Qwen) 作为核心推理引擎。
- **路由与决策 (Router)** :
  - *系统级路由* : 通过 `createReactAgent` 构建的 ReAct 循环，让 LLM 可以在“思考”、“调用工具”、“总结”之间自主循环。
  - *专家级工具* : 将高耗时的 CRAG 检索流程封装为 `search_novel_expert` 工具，只有在明确需要小说知识时才被 Agent 触发。
- **记忆 (Memory)** :
  - *长期记忆 (RAG)* : 通过 Milvus 向量数据库存储《天龙八部》全文的向量化数据。
  - *短期记忆 (Session)* : 使用 LangChain 的 `FileSystemChatMessageHistory`，结合滑动窗口截断策略，实现基于 SessionId 的持久化会话记录。
- **工具集 (Tools)** :
  - *MCP (模型上下文协议)* : 深度集成 MCP，将外部能力“赋能”给 AI。
  - *自定义 Tools* : 包含 IP 定位、SMTP 邮件发送等。

### 技术栈亮点

- **前端 (Client)** : 
  - **React 19** + **Zustand** + **Tailwind CSS** 构建。
  - 采用 **Framer Motion** 实现了细腻的物理级弹簧动效（包括平滑展开的思考卡片和气泡）。
  - 利用 `AbortController` 实现了对流式请求和 Agent 任务的随时中断。
  - 通过 `react-markdown` 实现了优雅的富文本渲染。
- **后端 (Server)** : 
  - 基于 **NestJS 11** 企业级框架重构，采用高度模块化设计。
  - 采用 **SSE (Server-Sent Events)** 技术实现了打字机式的流式响应，并在工具调用时提前将引用卡片推送给前端。
  - 集成 `@langchain/langgraph/prebuilt` 实现 ReAct 智能体。
- **数据库** : 选用 **Milvus** 作为高维向量的语义检索库。

## 快速开始

### 1. 环境准备

- Node.js (v18+)
- Milvus 向量数据库 (推荐 Docker 安装)
- PostgreSQL 关系数据库
- OpenAI 兼容的 API Key (如阿里通义千问、OpenAI 等)
- 高德地图 API Key (用于地理信息查询)
- 一个可用的 SMTP 邮箱服务 (如 QQ 邮箱、网易邮箱，用于邮件发送)

### 2. 项目安装

```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 3. 配置环境变量

在 `server` 目录下创建 `.env` 文件，并参考以下配置：

```env
# PostgreSQL 与认证
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/booksoul?schema=public
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_ACCESS_EXPIRES=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

# LLM 配置
OPENAI_API_KEY=sk-xxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，如使用第三方兼容接口
EMBEDDING_MODEL_NAME=text-embedding-3-small
MODEL_NAME=gpt-3.5-turbo

# 向量数据库配置
MILVUS_ADDRESS=localhost:19530
MILVUS_TOKEN=root:Milvus

# MCP 配置 (高德地图)
AMAP_API_KEY=your_amap_api_key

# 邮件发送配置 (SMTP)
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@qq.com
SMTP_PASS=your_email_auth_code
SMTP_FROM="BookSoul"<your_email@qq.com>
```

首次启动前执行数据库迁移和 Prisma Client 生成：

```bash
cd server
npm run prisma:migrate:deploy
npm run prisma:generate
```

### 4. 数据入库 (Data Ingestion)

将电子书（如 `天龙八部.epub`）放入项目根目录（与 `server` 和 `client` 同级），然后在 `server` 目录下运行：

```bash
npm run ingest -- ../天龙八部.epub
```

*该 NestJS 脚本会自动完成 Milvus 集合创建、文本智能切分 (RecursiveCharacterTextSplitter)、向量化及批量存储。*

### 5. 启动服务

**启动后端 API**:

```bash
cd server
npm run start:dev
# Server running at http://localhost:3000
```

**启动前端界面**:

```bash
cd client
npm run dev
# App running at http://localhost:5173
```

## 愿景

BookSoul 致力于打造一个“活”的书籍平台。通过 MCP 协议和智能 Agent 架构，我们打破了书本与现实的界限，让读者在阅读《天龙八部》时，不仅能与乔峰对饮，能一键导航至当年的松鹤楼，还能让段誉将武功秘籍“飞鸽传书”至你的信箱，让每一次阅读都成为一场跨越时空的灵魂交流。

## 一期验收路径

1. 以 Guest 身份进入并创建对话，刷新页面后 Guest ID 保持稳定。
2. 注册或登录，确认当前会话和记忆自动认领。
3. 让 Access Token 过期，确认前端只刷新一次并重放等待请求。
4. 登出当前设备，确认旧 Refresh Token 无法再次刷新，并回到新的 Guest。
5. 使用两个账号分别创建 history/memory，确认 URL、body、query 中伪造 `userId` 均不能越权。

Milvus 暂时不可用时，文件数据认领仍会完成，接口返回 `partial`。恢复 Milvus 后在侧栏点击“重试认领”即可安全补齐向量归属。

生产部署必须将当前开发环境的宽松 CORS 改为明确的前端域名白名单。
