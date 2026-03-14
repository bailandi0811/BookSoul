# BookSoul (书魂)

> **赋予书籍灵魂，与书中人物跨越时空对话。**

## 项目简介

BookSoul 是一个基于 RAG (检索增强生成) 与 MCP (模型上下文协议) 技术的沉浸式文学对话智能体 (Agent)。它不仅是一个简单的问答机器人，而是一个能 感知上下文、调用外部工具、并以特定“人格”与用户进行深度交互 的复杂系统。
本项目以金庸的《天龙八部》为载体，实现了与书中角色的“灵魂对话”，并能结合现实世界地理信息，提供“古今对照”的实景云游体验。

## 核心功能

- **沉浸式角色对话**: 结合原著性格与经历，模拟书中人物与读者进行对话。
- **智能语义检索**: 告别传统的关键词匹配，通过理解问题语义，精准定位原著段落。
- **RAG 增强问答**: 基于检索到的原文片段生成回答，确保内容的准确性与原汁原味，杜绝大模型“幻觉”。
- **MCP 实景云游**: 集成高德地图 API，当对话涉及地理位置（如“无量山”、“燕子坞”）时，自动关联现实世界的地理信息，提供位置查询、路线规划和实景描述。
- **流式响应**: 采用 Server-Sent Events (SSE) 技术，实现打字机效果的流畅对话体验。
- **Markdown 富文本**: 支持引用、列表、加粗等富文本渲染，提升阅读体验。

## 技术架构

## 核心架构：一个典型的现代 Agent
BookSoul 遵循经典的 Agent = LLM + Memory + Planning + Tools 架构范式：

- 大脑 (LLM) : 使用 LangChain 框架集成 OpenAI (GPT-4/3.5) 作为核心推理引擎，负责理解用户意图、决策行动和生成自然语言。
- 记忆 (Memory) :
  
  - 长期记忆 : 通过 Milvus 向量数据库存储《天龙八部》全文的向量化数据，构建了 Agent 的核心知识库。
  - 短期记忆 : 维护多轮对话的上下文，确保对话的连贯性。
-  规划 (Planning) :
  
  - 意图驱动的决策模型 : 这是项目的核心亮点。通过精心设计的 System Prompt ，我为 Agent 构建了一套严格的思考模式：在回答前，它必须首先 分析用户意图 （是问小说情节还是现实问题），然后根据意图选择不同的行动路径（是调用 RAG 还是调用工具），从根本上解决了 RAG 模式中常见的“上下文污染”问题。
  - 动态 Persona 系统 : Agent 能够根据用户选择（乔峰、段誉等）动态切换“人格”，改变其说话风格、语气甚至决策偏好。
- 工具 (Tools) :
  
  - MCP (模型上下文协议) : 项目深度集成了 MCP，将多个外部能力“赋能”给 AI。
  - 高德地图 API : 当对话涉及小说中的地名时，Agent 会自动调用地图工具，查询现实世界的地理信息，实现“古今对照”。
  - IP 定位服务 : 当用户问“我在哪”时，Agent 会调用自定义的 IP 定位工具，获取用户当前位置并给出符合角色人设的互动。
  - 文件系统 : Agent 具备访问本地文件系统的能力，为未来扩展更多功能（如分析本地文档）提供了可能。
技术亮点

- 前端 : 使用 React 19 和 Tailwind CSS 构建了具有“书卷气”和现代感的 UI，并利用 Framer Motion 实现了细腻的“Q弹”交互动效。通过 Zustand 进行全局状态管理。
- 后端 : 基于 Express.js 构建 API 服务，并采用 SSE (Server-Sent Events) 技术实现了打字机式的流式响应，提升了用户体验。
- 数据库 : 选用 Milvus 作为向量数据库，实现了高效的语义检索。
- Agent 框架 : 深度使用 LangChain ，包括其 Tool 、 PromptTemplate 和 LLMChain 等核心模块，构建了完整的 Agent 工作流。



## 快速开始

### 1. 环境准备

- Node.js (v18+)
- Milvus 向量数据库 (推荐 Docker 安装)
- OpenAI API Key (或兼容的 LLM 服务)
- 高德地图 API Key (用于地理信息查询)

### 2. 项目安装

```bash
# 根目录下
cd server
npm install

cd ../client
npm install
```

### 3. 配置环境变量

在 `server` 目录下创建 `.env` 文件：

```env
# LLM 配置
OPENAI_API_KEY=sk-xxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选
EMBEDDING_MODEL_NAME=text-embedding-3-small
MODEL_NAME=gpt-3.5-turbo

# 向量数据库配置
MILVUS_ADDRESS=localhost:19530
MILVUS_TOKEN=root:Milvus

# MCP 配置 (高德地图)
AMAP_API_KEY=your_amap_api_key
```

### 4. 数据入库 (Data Ingestion)

将电子书（如 `天龙八部.epub`）放入项目根目录（与 `server` 和 `client` 同级），然后运行：

```bash
cd server
npm run ingest -- ../天龙八部.epub
```

*该脚本会自动完成建表、文本切分、向量化及存储。*

### 5. 启动服务

**启动后端 API**:

```bash
cd server
npm start
# Server running at http://localhost:3000
```

**启动前端界面**:

```bash
cd client
npm run dev
# App running at http://localhost:5173
```

## 项目结构

```
booksoul/
├── client/                 # 前端项目
│   ├── src/
│   │   ├── components/
│   │   │   └── BookChat/   # 沉浸式对话核心组件
│   │   ├── store/          # Zustand 状态管理
│   │   └── ...
├── server/                 # 后端项目
│   ├── src/
│   │   ├── db/             # Milvus 数据库连接
│   │   ├── services/
│   │   │   ├── rag.js      # RAG 核心逻辑
│   │   │   └── mcp.js      # MCP 工具集成
│   │   └── ...
│   ├── scripts/            # 数据处理脚本
│   └── index.js            # API 入口
└── readme.md
```

## 愿景

BookSoul 致力于打造一个“活”的书籍平台。通过 MCP 协议，我们打破了书本与现实的界限，让读者在阅读《天龙八部》时，不仅能与乔峰对饮，还能一键导航至当年的松鹤楼，让每一次阅读都成为一场跨越时空的灵魂交流。

---

