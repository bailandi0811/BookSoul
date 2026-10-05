import type { BookView } from "../../src/lib/books-api";
import type { ReaderPosition } from "../../src/lib/book-reader-api";
export const fixtureUser = { id: "reader-fixture", email: "reader@example.invalid", name: "合成书友", emailVerifiedAt: null };
const date = "2026-10-03T00:00:00.000Z";
export const fixtureBooks: BookView[] = ["雾港来信", "月下旧书铺", "远行的钟"].map((title, index) => ({
  id: `fixture-${index + 1}`, title, author: "合成示例", visibility: index === 2 ? "SYSTEM" : "PRIVATE", status: "READY", statusProgress: 100, failureCode: null, failureMessage: null, originalFileName: "synthetic.txt", mimeType: "text/plain", fileSizeBytes: 160000, sectionCount: 3, chunkCount: 8, readyAt: date, createdAt: date, updatedAt: date, assistant: null, readingProgress: null,
}));
// Original synthetic prose keeps the visual fixture readable; no uploaded novel is used.
const intro = "  雾是在傍晚落下来的。先是远处的山，再是港口停泊的船，最后，连沿岸那排熟悉的路灯，也只剩下一圈淡淡的光。\n\n  陆迟站在旧码头的尽头，手里握着一封没有寄出的信。信封的边角已被海风磨得发软，收信人的名字却仍然清晰，像一件迟迟没有完成的事。\n\n  他已经很久没有回来。\n\n  身后传来脚步声，不急不缓，停在离他几步远的地方。\n\n  “我以为你不会来了。”\n\n  他转过身。灯塔的光恰好从海面扫过，照亮了来人的侧脸。那些曾经以为会被时间带走的记忆，在这一刻忽然有了温度。\n\n  他们谁也没有再说话。潮水在木桩间缓慢起落，远处的船鸣低低地响了一声，像是替这场重逢，轻轻翻开了下一页。\n\n  这是合成验收正文，所有人物与情节均为测试数据。😀\n<script>window.fixtureInjection=true</script>\n\n";
const repeated = "潮水经过旧码头，灯光照着一封没有寄出的信。😀这句话会重复出现，引用使用服务端偏移定位。\n\n";
const first = (intro + repeated.repeat(700)).slice(0, 30000) + "长段测试原文".repeat(10000).slice(0, 50000);
export const fixtureText = (sectionId: string) => sectionId.endsWith("-1") ? first : `合成章节 ${sectionId}\n\n` + repeated.repeat(400);
export const fixtureSections = (bookId: string) => [1, 2, 3].map(order => ({ id: `${bookId}-section-${order}`, order, title: ["灯塔下的重逢", "旧信与潮声", "清晨的航线"][order - 1], charCount: fixtureText(`${bookId}-section-${order}`).length }));
export function installReaderFixtures() {
  const requests: { path: string; method: string; offset?: number; length?: number; at: number; body?: unknown }[] = [];
  const control = { failNextContent: false, conflictNextSave: false, failNextSave: false, delayBook: "", delayMs: 0 };
  const hashes = new Map<string, Promise<string>>();
  let positions: Record<string, ReaderPosition> = JSON.parse(sessionStorage.getItem("reader-fixture-positions") ?? "{}");
  const confirmed: Record<string, { mode: "IN_PROGRESS"; currentSectionOrder: number; spoilerCeiling: number; updatedAt: string }> = {};
  const raiseConfirmed = (bookId: string, sectionId: string) => {
    const order = Number(sectionId.slice(-1));
    const current = confirmed[bookId]?.currentSectionOrder ?? 1;
    const nextOrder = Math.max(current, Number.isInteger(order) ? order : 1);
    const next = { mode: "IN_PROGRESS" as const, currentSectionOrder: nextOrder, spoilerCeiling: nextOrder, updatedAt: new Date().toISOString() };
    confirmed[bookId] = next;
    return next;
  };
  const hash = (id: string) => {
    if (!hashes.has(id)) hashes.set(id, crypto.subtle.digest("SHA-256", new TextEncoder().encode(fixtureText(id))).then(bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("")));
    return hashes.get(id)!;
  };
  const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
  const error = (status: number, code: string, message: string) => new Response(JSON.stringify({ code, message }), { status });
  const safe = (text: string, offset: number) => /[\uD800-\uDBFF]/.test(text[offset - 1] ?? "") && /[\uDC00-\uDFFF]/.test(text[offset] ?? "") ? offset - 1 : offset;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
    if (url.origin !== location.origin) throw new Error("合成验收阻止外部请求");
    const path = url.pathname, method = options.method ?? "GET";
    const entry: (typeof requests)[number] = { path, method, at: performance.now(), ...(options.body ? { body: JSON.parse(String(options.body)) } : {}) }; requests.push(entry);
    options.signal?.throwIfAborted();
    if (control.delayBook && path.includes(control.delayBook)) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, control.delayMs);
      options.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(options.signal?.reason); }, { once: true });
    });
    if (path === "/api/auth/me") return ok({ user: fixtureUser });
    if (path === "/api/auth/refresh") return ok({ accessToken: "public-fixture-token", user: fixtureUser });
    if (path === "/api/books" && method === "GET") return ok(fixtureBooks);
    const match = /^\/api\/books\/(fixture-[123])\/(.+)$/.exec(path);
    if (match) {
      const [, bookId, route] = match;
      if (route === "sections") return ok(fixtureSections(bookId));
      if (route === "reading-progress" && method === "GET") return ok(confirmed[bookId] ?? { mode: "IN_PROGRESS", currentSectionOrder: 1, spoilerCeiling: 1, updatedAt: date });
      if (route === "assistant" && method === "GET") return ok({ id: `assistant-${bookId}`, bookId, name: "本书助手", responseDepth: "BALANCED", tone: "NATURAL", customInstruction: null, createdAt: date, updatedAt: date });
      if (route === "sessions") return ok(method === "POST" ? { sessionId: `session-${bookId}`, title: "合成对话", updatedAt: date } : []);
      if (route === "reading-position") {
        if (method === "GET") return ok(positions[bookId] ?? null);
        if (method === "PUT") {
          if (control.failNextSave) { control.failNextSave = false; throw new TypeError("合成断网"); }
          const body = entry.body as { expectedRevision: number; sectionId: string; offset: number; contentHash: string };
          if (control.conflictNextSave || (positions[bookId]?.revision ?? 0) !== body.expectedRevision) {
            control.conflictNextSave = false;
            positions[bookId] = { bookId, sectionId: body.sectionId, offset: 20, contentHash: body.contentHash, revision: body.expectedRevision + 1, updatedAt: date, contentChanged: false };
            return error(409, "READER_POSITION_CONFLICT", "其他窗口已更新续读位置");
          }
          positions[bookId] = { bookId, sectionId: body.sectionId, offset: body.offset, contentHash: body.contentHash, revision: body.expectedRevision + 1, updatedAt: new Date().toISOString(), contentChanged: false, readingProgress: raiseConfirmed(bookId, body.sectionId) };
          sessionStorage.setItem("reader-fixture-positions", JSON.stringify(positions)); return ok(positions[bookId]);
        }
      }
      const content = /^sections\/(fixture-[123]-section-[123])\/content$/.exec(route);
      if (content && content[1].startsWith(bookId)) {
        if (control.failNextContent) { control.failNextContent = false; throw new TypeError("合成下一窗断网"); }
        const sectionId = content[1], text = fixtureText(sectionId);
        const startOffset = safe(text, Number(url.searchParams.get("offset") ?? 0)), endOffset = safe(text, Math.min(text.length, startOffset + Number(url.searchParams.get("limit") ?? 16000)));
        entry.offset = startOffset; entry.length = endOffset - startOffset;
        return ok({ bookId, sectionId, sectionOrder: Number(sectionId.slice(-1)), sectionTitle: fixtureSections(bookId).find(s => s.id === sectionId)!.title, contentHash: await hash(sectionId), totalLength: text.length, startOffset, endOffset, text: text.slice(startOffset, endOffset), nextOffset: endOffset < text.length ? endOffset : null });
      }
      if (route === "chunks/fixture-quote/location") return ok({ bookId, sectionId: `${bookId}-section-1`, sectionOrder: 1, contentHash: await hash(`${bookId}-section-1`), startOffset: 2000, endOffset: 2300, precision: "excerpt" });
      if (route === "chunks/missing/location") return error(404, "NOT_FOUND", "引用片段已不可用");
    }
    if (path === "/api/chat" && method === "POST") return new Response(`data: ${JSON.stringify({ content: "这封信在已读范围里是一条线索。以下是可访问的合成原文。", references: [{ bookId: "fixture-1", sectionId: "fixture-1-section-1", sectionOrder: 1, sectionTitle: "灯塔下的重逢", chunkId: "fixture-quote", chunkIndex: 0, excerpt: first.slice(2000, 2300), score: 1 }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    throw new Error(`合成验收禁止未列入清单的请求：${method} ${path}`);
  };
  Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: class { constructor() { throw new Error("合成验收禁止 XHR"); } } });
  navigator.sendBeacon = () => { throw new Error("合成验收禁止 beacon"); };
  return { requests, control, text: fixtureText, positions: () => positions, reset: () => { positions = {}; for (const key of Object.keys(confirmed)) delete confirmed[key]; sessionStorage.removeItem("reader-fixture-positions"); } };
}
