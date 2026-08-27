# BookSoul（书魂）

一个基于 React、NestJS 和 LangChain 的《天龙八部》角色对话应用，支持流式回答、小说检索、用户记忆和账号登录。

## 环境要求

- Node.js 22（推荐 `22.19.0`）
- PostgreSQL
- OpenAI API 兼容的 Chat 与 Embedding 服务
- Milvus（可选，只在需要小说向量检索时使用）

## 快速启动

### 1. 创建数据库

在 PostgreSQL 中创建一个名为 `booksoul` 的数据库。

没有本地 PostgreSQL 时，也可以直接用 Docker：

```powershell
docker run --name booksoul-postgres -e POSTGRES_USER=booksoul -e POSTGRES_PASSWORD=booksoul -e POSTGRES_DB=booksoul -p 5432:5432 -d postgres:16
```

### 2. 启动后端

```powershell
cd server
npm ci
Copy-Item .env.example .env
```

生成 JWT 密钥：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

打开 `server/.env`，至少修改下面这些配置：

```dotenv
DATABASE_URL=postgresql://booksoul:booksoul@127.0.0.1:5432/booksoul?schema=public
JWT_ACCESS_SECRET=粘贴刚才生成的随机密钥

OPENAI_API_KEY=你的API密钥
OPENAI_BASE_URL=你的API地址
MODEL_NAME=你的对话模型名称
EMBEDDING_MODEL_NAME=你的向量模型名称
```

初始化数据库并启动：

```powershell
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
```

看到以下地址即可：

```text
http://localhost:3000
```

### 3. 启动前端

另开一个终端：

```powershell
cd client
npm ci
npm run dev
```

浏览器访问：

```text
http://localhost:5173
```

访问后会先进入登录/注册页；认证成功后选择对话人物，再进入聊天页。聊天和记忆接口均需要登录。

> macOS / Linux 用户只需把 `Copy-Item .env.example .env` 换成 `cp .env.example .env`，其他命令相同。

## 启用小说检索（可选）

基础账号和对话功能不要求 Milvus。需要小说原文检索时，先启动 Milvus，并在 `server/.env` 中配置：

```dotenv
MILVUS_ADDRESS=localhost:19530
MILVUS_TOKEN=root:Milvus
```

然后在 `server` 目录导入电子书：

```powershell
npm run ingest -- ../天龙八部.epub
```

Embedding 模型需要支持输出 1024 维向量。

## 常用命令

```powershell
# 后端检查
cd server
npm run check

# 前端检查
cd client
npm run check
```

## 常见问题

### JWT 密钥错误

如果后端提示 `JWT_ACCESS_SECRET must be a private value...`，说明 `.env` 仍在使用模板值。重新生成密钥并替换即可。

### 数据库连接失败

确认 PostgreSQL 已启动、数据库已经创建，并检查 `DATABASE_URL` 中的用户名、密码和端口。

### 登录或接口请求失败

先访问 `http://localhost:3000` 确认后端运行，再访问 `http://localhost:5173`。后端或 `.env` 修改后需要重启服务。
