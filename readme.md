# BookSoul (书魂)

> **赋予书籍灵魂，与书中人物跨越时空对话。**

## 项目简介

BookSoul 是一个基于 RAG (检索增强生成) 与 MCP (模型上下文协议) 技术的沉浸式文学对话智能体 (Agent)。它不仅是一个简单的问答机器人，而是一个能 **感知上下文、调用外部工具、并以特定“人格”与用户进行深度交互** 的复杂系统。

本项目以金庸的《天龙八部》为载体，实现了与书中角色的“灵魂对话”，并能结合现实世界地理信息提供“古今对照”的实景云游体验，甚至能将书中内容通过邮件发送给用户。

## 核心功能

- **沉浸式角色对话**: 结合原著性格与经历，模拟书中人物（如乔峰、段誉、王语嫣）与读者进行对话。
- **智能语义检索**: 告别传统的关键词匹配，基于 Milvus 向量数据库理解问题语义，精准定位原著段落。
- **RAG 增强问答**: 基于检索到的原文片段生成回答，确保内容的准确性与原汁原味，杜绝大模型“幻觉”。
- **MCP 实景云游 (Tools)**: 集成高德地图 API，当对话涉及地理位置（如“无量山”、“燕子坞”）时，自动关联现实世界的地理信息，提供位置查询和实景描述。
- **智能定位感知 (Tools)**: 当用户询问“我在哪”时，Agent 会自动调用内部 IP 定位工具，感知用户真实地理位置并以角色口吻互动。
- **邮件发送服务 (Tools)**: 支持将小说片段、武功秘籍或对话内容一键通过邮件（SMTP）发送至用户指定邮箱。
- **流式响应**: 采用 Server-Sent Events (SSE) 技术，实现打字机效果的流畅对话体验。
- **Agent 状态中枢 (Frontend)**: 桌面端采用现代化的双栏布局，右侧实时可视化展示 Agent 的当前人格、挂载能力和最新检索上下文。

## 技术架构

### 核心架构：一个典型的现代 Agent

BookSoul 遵循经典的 `Agent = LLM + Memory + Planning + Tools` 架构范式：

- **大脑 (LLM)** : 使用 LangChain 框架集成 OpenAI 兼容模型 (如 GPT-4/Qwen) 作为核心推理引擎，负责理解用户意图、决策行动和生成自然语言。
- **记忆 (Memory)** :
  - *长期记忆* : 通过 Milvus 向量数据库存储《天龙八部》全文的向量化数据，构建了 Agent 的核心知识库。
  - *短期记忆* : 维护多轮对话的上下文，确保对话的连贯性。
- **规划 (Planning)** :
  - *意图驱动的决策模型* : 这是项目的核心亮点。通过精心设计的 System Prompt，为 Agent 构建了一套严格的思考模式：在回答前，它必须首先**分析用户意图**（是问小说情节、现实定位还是发邮件），然后根据意图**选择不同的行动路径**（调用 RAG 或特定工具），从根本上解决了 RAG 模式中常见的“上下文污染”问题。
  - *动态 Persona 系统* : Agent 能够根据用户选择动态切换“人格”，改变其说话风格、语气甚至决策偏好。
- **工具 (Tools)** :
  - *MCP (模型上下文协议)* : 项目深度集成了 MCP，将外部能力“赋能”给 AI，包括高德地图和本地文件系统。
  - *自定义 Tools* : 利用 LangChain 动态构建了精准的 IP 定位工具和 SMTP 邮件发送工具。

### 技术栈亮点

- **前端 (Client)** : 
  - 使用 **React 19** 和 **Tailwind CSS** 构建。
  - 采用现代化的**双栏工作台布局 (Agent Hub)**，左侧为暗色系高质感聊天流，右侧为能力状态面板。
  - 利用 **Framer Motion** 实现了细腻的物理级弹簧动效。
  - 通过 `@tailwindcss/typography` 实现了优雅的富文本 Markdown 渲染。
- **后端 (Server)** : 
  - 全面重构为 **NestJS** 企业级框架，采用模块化设计 (ConfigModule, MilvusModule, McpModule, RagModule)。
  - 采用 **SSE (Server-Sent Events)** 技术实现了打字机式的流式响应。
  - 集成 `@nestjs-modules/mailer` 提供稳定的邮件发送能力。
- **数据库** : 选用 **Milvus** 作为向量数据库，支持千万级高维向量的高效语义检索。
- **AI 框架** : 深度使用 **LangChain.js** 构建 Agent 工作流和 Tool 绑定。

## 快速开始

### 1. 环境准备

- Node.js (v18+)
- Milvus 向量数据库 (推荐 Docker 安装)
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
