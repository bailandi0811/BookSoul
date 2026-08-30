import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "./useChatStore";

function success(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("book-scoped chat state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({
      currentBookId: null,
      messages: [],
      draftInput: "",
      lastStopNotice: null,
      sessionId: null,
      sessions: [],
      isLoading: false,
      isSessionsLoading: false,
      abortController: null,
      activeRequestId: null,
    });
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
      messages: [{ role: "user", content: "旧消息" }],
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

  it("resetBookChat aborts an in-flight response and clears private state", () => {
    const abort = vi.fn();
    useChatStore.setState({
      currentBookId: "book-a",
      sessionId: "server-session",
      isLoading: true,
      abortController: { abort } as unknown as AbortController,
      activeRequestId: "request-a",
      messages: [{ role: "user", content: "问题", createdAt: 1 }],
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
