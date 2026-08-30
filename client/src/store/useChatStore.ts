import { create } from "zustand";
import { apiFetch, readApiError } from "@/lib/api";
import { useMemoryStore } from "@/store/useMemoryStore";

export interface Reference {
  bookId: string;
  sectionId: string;
  sectionOrder: number;
  sectionTitle: string;
  chunkId: string;
  chunkIndex: number;
  excerpt: string;
  score: number;
}

export interface ExternalReference {
  title: string;
  url: string;
  snippet: string;
}

export interface HistorySession {
  sessionId: string;
  title: string;
  createdAt?: string;
  updatedAt: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  references?: Reference[];
  externalReferences?: ExternalReference[];
  isStreaming?: boolean;
  isThinking?: boolean;
  thinkingText?: string;
  thinkingSteps?: string[];
  createdAt?: number;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface MemoryUpdateData {
  memoryCount: number;
  hasNewMemories: boolean;
  updatedCount?: number;
}

interface ChatState {
  currentBookId: string | null;
  draftInput: string;
  lastStopNotice: string | null;
  messages: Message[];
  isLoading: boolean;
  sessionId: string | null;
  sessions: HistorySession[];
  isSessionsLoading: boolean;
  abortController: AbortController | null;
  activeRequestId: string | null;
  addMessage: (message: Message) => void;
  updateStreamingContent: (content: string, requestId?: string) => void;
  finishStreaming: (requestId?: string) => void;
  setThinking: (isThinking: boolean, text?: string, requestId?: string) => void;
  setDraftInput: (value: string) => void;
  clearStopNotice: () => void;
  stopGenerating: () => void;
  prepareBook: (bookId: string) => Promise<void>;
  resetBookChat: () => void;
  fetchSessions: (bookId?: string) => Promise<void>;
  startNewSession: (bookId?: string) => Promise<string | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  sendMessage: (
    content: string,
    spoilerOverride?: boolean,
    externalResearch?: boolean,
  ) => Promise<void>;
}

const CHAT_INACTIVITY_TIMEOUT_MS = 30_000;
let latestSessionLoadRequest = 0;

async function readData<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = (await response.json()) as SuccessResponse<T>;
  return payload.data;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentBookId: null,
  draftInput: "",
  lastStopNotice: null,
  messages: [],
  isLoading: false,
  sessionId: null,
  sessions: [],
  isSessionsLoading: false,
  abortController: null,
  activeRequestId: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...message, createdAt: message.createdAt ?? Date.now() },
      ],
    })),

  updateStreamingContent: (content, requestId) =>
    set((state) => {
      if (requestId && state.activeRequestId !== requestId) return state;
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        messages[messages.length - 1] = {
          ...last,
          content,
          isStreaming: true,
        };
      }
      return { messages };
    }),

  finishStreaming: (requestId) =>
    set((state) => {
      if (requestId && state.activeRequestId !== requestId) return state;
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        messages[messages.length - 1] = {
          ...last,
          isStreaming: false,
          isThinking: false,
        };
      }
      return {
        messages,
        abortController: null,
        activeRequestId: null,
      };
    }),

  setThinking: (isThinking, text, requestId) =>
    set((state) => {
      if (requestId && state.activeRequestId !== requestId) return state;
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role !== "assistant") return state;
      const thinkingSteps = [...(last.thinkingSteps ?? [])];
      if (text && thinkingSteps[thinkingSteps.length - 1] !== text)
        thinkingSteps.push(text);
      messages[messages.length - 1] = {
        ...last,
        isThinking,
        ...(text ? { thinkingText: text, thinkingSteps } : {}),
      };
      return { messages };
    }),

  setDraftInput: (value) => set({ draftInput: value }),
  clearStopNotice: () => set({ lastStopNotice: null }),

  stopGenerating: () => {
    const { abortController, activeRequestId } = get();
    if (!abortController) return;
    abortController.abort();
    get().finishStreaming(activeRequestId ?? undefined);
    set({ lastStopNotice: "已停止生成", isLoading: false });
  },

  prepareBook: async (bookId) => {
    latestSessionLoadRequest += 1;
    get().stopGenerating();
    set({
      currentBookId: bookId,
      sessionId: null,
      sessions: [],
      messages: [],
      draftInput: "",
      lastStopNotice: null,
      isLoading: false,
      abortController: null,
      activeRequestId: null,
    });
    await get().fetchSessions(bookId);
  },

  resetBookChat: () => {
    latestSessionLoadRequest += 1;
    get().stopGenerating();
    set({
      currentBookId: null,
      draftInput: "",
      lastStopNotice: null,
      messages: [],
      isLoading: false,
      sessionId: null,
      sessions: [],
      isSessionsLoading: false,
      abortController: null,
      activeRequestId: null,
    });
  },

  fetchSessions: async (bookId) => {
    const targetBookId = bookId ?? get().currentBookId;
    if (!targetBookId) return;
    set({ isSessionsLoading: true });
    try {
      const sessions = await readData<HistorySession[]>(
        await apiFetch(`/api/books/${targetBookId}/sessions`),
      );
      if (get().currentBookId === targetBookId) set({ sessions });
    } catch (error) {
      console.error("Failed to fetch book sessions:", error);
    } finally {
      if (get().currentBookId === targetBookId) {
        set({ isSessionsLoading: false });
      }
    }
  },

  startNewSession: async (bookId) => {
    const targetBookId = bookId ?? get().currentBookId;
    if (!targetBookId) return null;
    get().stopGenerating();
    latestSessionLoadRequest += 1;
    try {
      const session = await readData<HistorySession>(
        await apiFetch(`/api/books/${targetBookId}/sessions`, {
          method: "POST",
        }),
      );
      if (get().currentBookId !== targetBookId) return null;
      set((state) => ({
        sessionId: session.sessionId,
        messages: [],
        lastStopNotice: null,
        sessions: [
          session,
          ...state.sessions.filter(
            (item) => item.sessionId !== session.sessionId,
          ),
        ],
      }));
      return session.sessionId;
    } catch (error) {
      set({
        lastStopNotice: error instanceof Error ? error.message : "无法创建会话",
      });
      return null;
    }
  },

  deleteSession: async (sessionId) => {
    try {
      const response = await apiFetch(`/api/chat/history/${sessionId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const wasActive = get().sessionId === sessionId;
      set((state) => ({
        sessions: state.sessions.filter(
          (session) => session.sessionId !== sessionId,
        ),
        ...(wasActive ? { sessionId: null, messages: [] } : {}),
      }));
    } catch (error) {
      set({
        lastStopNotice: error instanceof Error ? error.message : "删除会话失败",
      });
    }
  },

  loadSession: async (sessionId) => {
    if (get().sessionId === sessionId && get().messages.length > 0) return;
    get().stopGenerating();
    const requestId = ++latestSessionLoadRequest;
    set({
      isLoading: true,
      sessionId,
      messages: [],
      lastStopNotice: null,
    });
    try {
      const messages = await readData<Message[]>(
        await apiFetch(`/api/chat/history/${sessionId}`),
      );
      if (
        requestId === latestSessionLoadRequest &&
        get().sessionId === sessionId
      ) {
        set({
          messages: messages.map((message) => ({
            ...message,
            createdAt: message.createdAt ?? Date.now(),
          })),
        });
      }
    } catch (error) {
      if (requestId === latestSessionLoadRequest) {
        set({
          lastStopNotice:
            error instanceof Error ? error.message : "加载会话失败",
        });
      }
    } finally {
      if (
        requestId === latestSessionLoadRequest &&
        get().sessionId === sessionId
      ) {
        set({ isLoading: false });
      }
    }
  },

  sendMessage: async (
    content,
    spoilerOverride = false,
    externalResearch = false,
  ) => {
    const currentBookId = get().currentBookId;
    if (!currentBookId) return;
    let sessionId = get().sessionId;
    if (!sessionId) sessionId = await get().startNewSession(currentBookId);
    if (!sessionId || get().currentBookId !== currentBookId) return;

    latestSessionLoadRequest += 1;
    get().stopGenerating();
    set({ lastStopNotice: null });

    const abortController = new AbortController();
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random()}`;
    set({ abortController, activeRequestId: requestId });
    get().addMessage({ role: "user", content });
    get().addMessage({
      role: "assistant",
      content: "",
      isStreaming: true,
      isThinking: false,
      thinkingText: "",
      thinkingSteps: [],
    });
    set({ isLoading: true });

    let assistantMessage = "";
    let bufferedContent = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let inactivityTimedOut = false;
    let hasRenderedFirstToken = false;
    let lastThinkingAt = 0;
    let lastThinkingText = "";
    const THINKING_THROTTLE_MS = 350;
    const CONTENT_FLUSH_MS = 45;

    const armInactivityTimeout = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        inactivityTimedOut = true;
        abortController.abort();
      }, CHAT_INACTIVITY_TIMEOUT_MS);
    };
    const flushBufferedContent = () => {
      if (!bufferedContent) return;
      assistantMessage += bufferedContent;
      bufferedContent = "";
      get().updateStreamingContent(assistantMessage, requestId);
    };
    const scheduleContentFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushBufferedContent();
      }, CONTENT_FLUSH_MS);
    };

    try {
      armInactivityTimeout();
      const response = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          sessionId,
          spoilerOverride,
          externalResearch,
        }),
        signal: abortController.signal,
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armInactivityTimeout();
          buffer += decoder.decode(value, { stream: true });
          let eventEndIndex = buffer.indexOf("\n\n");
          while (eventEndIndex >= 0) {
            const event = buffer.slice(0, eventEndIndex);
            buffer = buffer.slice(eventEndIndex + 2);
            for (const line of event.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") continue;
              const data = JSON.parse(raw) as {
                error?: string;
                thinking?: string;
                references?: Reference[];
                externalReferences?: ExternalReference[];
                content?: string;
                memoryUpdate?: MemoryUpdateData;
              };
              if (data.error) throw new Error(data.error);
              if (data.thinking) {
                const now = Date.now();
                if (
                  !hasRenderedFirstToken &&
                  data.thinking !== lastThinkingText &&
                  now - lastThinkingAt >= THINKING_THROTTLE_MS
                ) {
                  lastThinkingAt = now;
                  lastThinkingText = data.thinking;
                  get().setThinking(true, data.thinking, requestId);
                }
              }
              if (data.references) {
                set((state) => {
                  if (state.activeRequestId !== requestId) return state;
                  const messages = [...state.messages];
                  const last = messages[messages.length - 1];
                  if (last) {
                    messages[messages.length - 1] = {
                      ...last,
                      references: data.references,
                    };
                  }
                  return { messages };
                });
              }
              if (data.externalReferences) {
                set((state) => {
                  if (state.activeRequestId !== requestId) return state;
                  const messages = [...state.messages];
                  const last = messages[messages.length - 1];
                  if (last) {
                    messages[messages.length - 1] = {
                      ...last,
                      externalReferences: data.externalReferences,
                    };
                  }
                  return { messages };
                });
              }
              if (data.content) {
                if (!hasRenderedFirstToken) {
                  hasRenderedFirstToken = true;
                  get().setThinking(false, undefined, requestId);
                  assistantMessage += data.content;
                  get().updateStreamingContent(assistantMessage, requestId);
                } else {
                  bufferedContent += data.content;
                  scheduleContentFlush();
                }
              }
              if (data.memoryUpdate) {
                useMemoryStore.getState().handleMemoryUpdate(data.memoryUpdate);
              }
            }
            eventEndIndex = buffer.indexOf("\n\n");
          }
        }
        flushBufferedContent();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (inactivityTimedOut) {
          get().updateStreamingContent(
            "阅读助手长时间没有响应，请稍后重试。",
            requestId,
          );
        }
      } else {
        get().updateStreamingContent(
          error instanceof Error ? error.message : "回答失败，请稍后重试。",
          requestId,
        );
      }
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (get().activeRequestId === requestId) {
        flushBufferedContent();
        get().finishStreaming(requestId);
        set({ isLoading: false });
        await get().fetchSessions(currentBookId);
      }
    }
  },
}));
