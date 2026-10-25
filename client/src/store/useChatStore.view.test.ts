import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "./useChatStore";
import { useMemoryStore } from "./useMemoryStore";

function success(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("book-scoped chat state", () => {
  it("does not apply late summary or memory events to a new book", async () => {
    useChatStore.setState({
      currentBookId: "fixture-old",
      sessionId: "fixture-session",
    });
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url) === "/api/chat" ? new Response(body) : success([]),
    );
    const memory = vi.spyOn(useMemoryStore.getState(), "handleMemoryUpdate");
    const running = useChatStore
      .getState()
      .sendMessage("问题", false, false, "deep");
    await Promise.resolve();
    useChatStore.getState().stopGenerating();
    useChatStore.setState({
      currentBookId: "fixture-new",
      sessionId: "fixture-new-session",
      activeRequestId: "new-request",
      messages: [{ id: "a1", role: "assistant", content: "new answer" }],
    });
    controller!.enqueue(
      new TextEncoder().encode(
        'data: {"runSummary":{"mode":"deep","stopReason":"no_queries","retrievalRounds":1,"incomplete":true},"memoryUpdate":{"memoryCount":1,"hasNewMemories":true},"content":"late"}\n\n',
      ),
    );
    controller!.close();
    await running;
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: "assistant", content: "new answer" }),
    ]);
    expect(memory).not.toHaveBeenCalled();
  });
  it("keeps a deep request alive across 30 seconds when heartbeat bytes arrive", async () => {
    vi.useFakeTimers();
    try {
      useChatStore.setState({
        currentBookId: "fixture-book",
        sessionId: "fixture-session",
      });
      let controller: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
        String(url) === "/api/chat" ? new Response(body) : success([]),
      );
      const running = useChatStore
        .getState()
        .sendMessage("问题", false, false, "deep");
      await vi.advanceTimersByTimeAsync(20000);
      controller!.enqueue(
        new TextEncoder().encode(
          'data: {"thinking":"正在等待本轮处理完成…"}\n\n',
        ),
      );
      await vi.advanceTimersByTimeAsync(20000);
      expect(useChatStore.getState().abortController?.signal.aborted).toBe(
        false,
      );
      controller!.enqueue(
        new TextEncoder().encode(
          'data: {"content":"answer"}\n\ndata: [DONE]\n\n',
        ),
      );
      controller!.close();
      await running;
      expect(useChatStore.getState().messages.at(-1)?.content).toBe("answer");
    } finally {
      vi.useRealTimers();
    }
  });
  it("attaches deep summary only to current request", async () => {
    useChatStore.setState({
      currentBookId: "fixture-book",
      sessionId: "fixture-session",
      messages: [],
      isLoading: false,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url) === "/api/chat"
        ? new Response(
            'data: {"runSummary":{"mode":"deep","stopReason":"no_queries","retrievalRounds":1,"incomplete":true}}\n\ndata: {"content":"依据有限"}\n\ndata: [DONE]\n\n',
          )
        : success([]),
    );
    await useChatStore.getState().sendMessage("问题", false, false, "deep");
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({
      runSummary: { incomplete: true },
    });
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({
      currentBookId: null,
      messages: [],
      historyCursor: null,
      hasOlderMessages: false,
      isOlderMessagesLoading: false,
      olderMessagesError: null,
      draftInput: "",
      lastStopNotice: null,
      pendingEmailDraft: null,
      sessionId: null,
      sessions: [],
      isLoading: false,
      isSessionsLoading: false,
      abortController: null,
      activeRequestId: null,
    });
  });

  it("falls back to the legacy history endpoint when pagination is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes("/messages?")) {
        return new Response("Cannot GET", { status: 404 });
      }
      if (path.includes("/api/chat/history/session-a")) {
        return success(
          Array.from({ length: 35 }, (_, index) => ({
            role: index % 2 === 0 ? "user" : "assistant",
            content: `message-${index}`,
          })),
        );
      }
      return success([]);
    });
    await useChatStore.getState().loadSession("session-a");
    expect(useChatStore.getState().messages).toHaveLength(30);
    expect(useChatStore.getState().hasOlderMessages).toBe(true);
    expect(useChatStore.getState().historyCursor).toBe(5);
  });

  it("loads only the latest history page when opening a session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes("/messages?")) {
        return success({
          items: [
            {
              id: "session-a:0",
              position: 0,
              role: "user",
              content: "最新页",
            },
          ],
          nextCursor: null,
          hasMore: false,
        });
      }
      return success([]);
    });
    await useChatStore.getState().loadSession("session-a");
    expect(useChatStore.getState().messages).toEqual([
      { id: "session-a:0", role: "user", content: "最新页" },
    ]);
    expect(useChatStore.getState()).toMatchObject({
      historyCursor: null,
      hasOlderMessages: false,
    });
  });

  it("prepends older pages without duplicate ids", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes("before=2")) {
        return success({
          items: [
            {
              id: "session-a:0",
              position: 0,
              role: "user",
              content: "更早",
            },
            {
              id: "session-a:1",
              position: 1,
              role: "assistant",
              content: "更早回答",
            },
          ],
          nextCursor: null,
          hasMore: false,
        });
      }
      if (path.includes("/messages?")) {
        return success({
          items: [
            {
              id: "session-a:2",
              position: 2,
              role: "user",
              content: "最新",
            },
          ],
          nextCursor: 2,
          hasMore: true,
        });
      }
      return success([]);
    });
    await useChatStore.getState().loadSession("session-a");
    await useChatStore.getState().loadOlderMessages();
    expect(useChatStore.getState().messages.map((message) => message.id)).toEqual(
      ["session-a:0", "session-a:1", "session-a:2"],
    );
  });

  it("drops stale older-page responses after switching sessions", async () => {
    let resolveOlder: (value: Response) => void = () => undefined;
    const olderPromise = new Promise<Response>((resolve) => {
      resolveOlder = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes("before=1")) return olderPromise;
      if (path.includes("/messages?")) {
        if (path.includes("session-b")) {
          return success({
            items: [],
            nextCursor: null,
            hasMore: false,
          });
        }
        return success({
          items: [
            {
              id: "session-a:1",
              position: 1,
              role: "assistant",
              content: "A",
            },
          ],
          nextCursor: 1,
          hasMore: true,
        });
      }
      return success([]);
    });
    await useChatStore.getState().loadSession("session-a");
    const loading = useChatStore.getState().loadOlderMessages();
    await useChatStore.getState().loadSession("session-b");
    resolveOlder(
      success({
        items: [
          {
            id: "session-a:0",
            position: 0,
            role: "user",
            content: "stale",
          },
        ],
        nextCursor: null,
        hasMore: false,
      }),
    );
    await loading;
    expect(useChatStore.getState().sessionId).toBe("session-b");
    expect(
      useChatStore.getState().messages.some(
        (message) => message.content === "stale",
      ),
    ).toBe(false);
  });

  it("prepares a book on a new conversation while keeping server sessions available", async () => {
    const existingSession = {
      sessionId: "existing-session",
      title: "之前的对话",
      updatedAt: "2026-08-29T00:00:00.000Z",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(success([existingSession]));

    useChatStore.setState({
      currentBookId: "previous-book",
      sessionId: "previous-session",
      messages: [{ id: "u1", role: "user", content: "旧消息" }],
    });

    await useChatStore.getState().prepareBook("book-a");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/book-a/sessions",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(useChatStore.getState()).toMatchObject({
      currentBookId: "book-a",
      sessionId: null,
      messages: [],
      sessions: [existingSession],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the server generated session id for a new conversation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      success({
        sessionId: "server-session",
        title: "新对话",
        updatedAt: "2026-08-29T00:00:00.000Z",
      }),
    );
    useChatStore.setState({ currentBookId: "book-a" });

    await expect(useChatStore.getState().startNewSession()).resolves.toBe(
      "server-session",
    );
    expect(useChatStore.getState()).toMatchObject({
      sessionId: "server-session",
      messages: [],
    });
  });

  it("sends only the scoped chat choices and keeps external sources separate", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        if (input === "/api/chat") {
          return new Response(
            'data: {"externalReferences":[{"title":"资料","url":"https://example.com/source","snippet":"摘要"}]}\n\ndata: {"content":"回答"}\n\ndata: [DONE]\n\n',
            {
              status: 200,
              headers: { "Content-Type": "text/event-stream" },
            },
          );
        }
        return success([]);
      });
    useChatStore.setState({
      currentBookId: "book-a",
      sessionId: "server-session",
    });

    await useChatStore.getState().sendMessage("问题", true, true);

    const chatCall = fetchMock.mock.calls.find(
      ([input]) => input === "/api/chat",
    );
    expect(chatCall).toBeDefined();
    const body = JSON.parse(String(chatCall?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      message: "问题",
      sessionId: "server-session",
      spoilerOverride: true,
      externalResearch: true,
    });
    expect(body).not.toHaveProperty("character");
    expect(body).not.toHaveProperty("bookId");
    expect(useChatStore.getState().messages.at(-1)?.content).toBe("回答");
    expect(useChatStore.getState().messages.at(-1)?.externalReferences).toEqual(
      [
        {
          title: "资料",
          url: "https://example.com/source",
          snippet: "摘要",
        },
      ],
    );
  });

  it("opens the confirmation dialog from a model email tool event", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "/api/chat") {
        return new Response(
          'data: {"content":"邮件草稿已准备好。"}\n\ndata: {"emailDraft":{"to":"reader@example.com","subject":"阅读笔记","text":"正文"}}\n\ndata: [DONE]\n\n',
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          },
        );
      }
      return success([]);
    });
    useChatStore.setState({
      currentBookId: "book-a",
      sessionId: "server-session",
    });

    await useChatStore.getState().sendMessage("把刚才的回答发到我的邮箱");

    expect(useChatStore.getState().pendingEmailDraft).toEqual({
      to: "reader@example.com",
      subject: "阅读笔记",
      text: "正文",
    });
    expect(useChatStore.getState().messages.at(-1)?.content).toBe(
      "邮件草稿已准备好。",
    );
  });

  it("resetBookChat aborts an in-flight response and clears private state", () => {
    const abort = vi.fn();
    useChatStore.setState({
      currentBookId: "book-a",
      sessionId: "server-session",
      isLoading: true,
      abortController: { abort } as unknown as AbortController,
      activeRequestId: "request-a",
      messages: [{ id: "u1", role: "user", content: "问题", createdAt: 1 }],
    });

    useChatStore.getState().resetBookChat();

    expect(abort).toHaveBeenCalled();
    expect(useChatStore.getState()).toMatchObject({
      currentBookId: null,
      sessionId: null,
      isLoading: false,
      messages: [],
    });
  });

  it("ignores completion from an older streaming request", () => {
    const activeController = new AbortController();
    useChatStore.setState({
      activeRequestId: "new-request",
      abortController: activeController,
      isLoading: true,
      messages: [
        {
          id: "a1",
          role: "assistant",
          content: "new answer",
          isStreaming: true,
        },
      ],
    });

    useChatStore.getState().finishStreaming("old-request");

    expect(useChatStore.getState()).toMatchObject({
      activeRequestId: "new-request",
      abortController: activeController,
      isLoading: true,
    });
    expect(useChatStore.getState().messages[0].isStreaming).toBe(true);
  });
});
