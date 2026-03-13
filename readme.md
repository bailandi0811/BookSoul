# BookSoul (书魂)

> **赋予书籍灵魂，与书中人物跨越时空对话。**

## 📖 项目简介

**BookSoul** 是一个基于 **RAG (检索增强生成)** 技术的沉浸式电子书阅读伴侣。它不仅仅是一个阅读器，更是一个能让书中人物“活”过来的智能体平台。

本项目采用 **React 19 + Express + LangChain + Milvus** 全栈架构，实现了流式对话、沉浸式阅读与智能问答功能。

## ✨ 核心功能

- **沉浸式角色对话**: 结合原著性格与经历，模拟书中人物与读者进行对话。
- **智能语义检索**: 告别传统的关键词匹配，通过理解问题语义，精准定位原著段落。
- **RAG 增强问答**: 基于检索到的原文片段生成回答，确保内容的准确性与原汁原味，杜绝大模型“幻觉”。
- **流式响应**: 采用 Server-Sent Events (SSE) 技术，实现打字机效果的流畅对话体验。

## 🛠️ 技术架构

### 前端 (Client)
- **Framework**: React 19 (Vite 构建)
- **UI Components**: shadcn/ui + Tailwind CSS
- **State Management**: Zustand (Store 分离模式)
- **Icons**: Lucide React

### 后端 (Server)
- **Runtime**: Node.js + Express
- **LLM Framework**: LangChain.js
- **Vector Database**: Milvus
- **Ebook Parser**: epub2

## 🚀 快速开始

### 1. 环境准备

- Node.js (v18+)
- Milvus 向量数据库 (推荐 Docker 安装)
- OpenAI API Key

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
OPENAI_API_KEY=sk-xxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选
EMBEDDING_MODEL_NAME=text-embedding-3-small
MODEL_NAME=gpt-3.5-turbo

MILVUS_ADDRESS=localhost:19530
MILVUS_TOKEN=root:Milvus
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

## 📂 项目结构

```
booksoul/
├── client/                 # 前端项目
│   ├── src/
│   │   ├── components/ui/  # shadcn/ui 组件
│   │   ├── store/          # Zustand 状态管理
│   │   └── ...
├── server/                 # 后端项目
│   ├── src/
│   │   ├── db/             # 数据库连接
│   │   ├── services/       # RAG 核心逻辑
│   │   └── ...
│   ├── scripts/            # 数据处理脚本
│   └── index.js            # API 入口
└── readme.md
```

## 🌟 愿景

BookSoul 致力于打造一个“活”的书籍平台。未来，我们将支持更多书籍的自动导入，甚至允许用户自定义角色的性格 Prompt，让每一次阅读都成为一场跨越时空的灵魂交流。

---

*Powered by LangChain & Milvus*
