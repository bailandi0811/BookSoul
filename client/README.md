# BookSoul Client

React 19、TypeScript、Vite、Zustand、Tailwind CSS 与 Framer Motion 构建的私人阅读助手界面。

## 命令

```bash
npm ci
npm run dev
npm run check
npm run build
```

前端包含：

- 登录后的私人书架，以及 EPUB/TXT 上传、状态轮询、失败重试和可靠删除提示；
- 单书工作区、目录、阅读进度、按书会话和助手设置；
- SSE 内容、引用与记忆更新，以及请求级中断和竞态隔离；
- 默认防剧透和单次全书检索放行；
- 桌面可调侧栏、移动端抽屉、暗色主题和系统减少动态效果支持；
- 加载、空、失败与重试状态。

刷新令牌不进入 Zustand、Local Storage 或前端响应类型。所有 API 请求使用 `credentials: include` 携带 HttpOnly Cookie；聊天 body 不发送角色、owner 或 book id。
