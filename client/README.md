# BookSoul Client

React 19、TypeScript、Vite、Zustand、Tailwind CSS 与 Framer Motion 构建的沉浸式阅读对话界面。

## 命令

```bash
npm install
npm run dev
npm run check
npm run build
```

前端仅使用 npm，并只跟踪 `package-lock.json`。

实现包含：

- 入口页和聊天页懒加载；
- SSE 内容缓冲及请求级竞态隔离；
- 并发 401 单次 Cookie 刷新；
- 移动端抽屉侧栏、键盘宽度调节和持久化主题；
- 尊重系统“减少动态效果”偏好；
- 记忆新增、编辑和删除确认。

刷新令牌不进入 Zustand、Local Storage 或前端响应类型。所有 API 请求使用 `credentials: include` 以携带同源 HttpOnly Cookie。
