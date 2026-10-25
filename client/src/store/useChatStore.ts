import { create } from "zustand";
import { apiFetch, readApiError } from "@/lib/api";
import {
  createClientMessageId,
  type HistoryMessagePage,
  type HistoryMessagePageItem,
} from "@/lib/chat-history-page";
import { useMemoryStore } from "@/store/useMemoryStore";
import type { EmailDraft } from "@/lib/email-draft";

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

export type NewMessage = Omit<Message, "id"> & { id?: string };

export interface Message {
  id: string;
  responseStatus?: "failed" | "cancelled";
  runSummary?: DeepRunSummary;
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

export interface DeepRunSummary {
  mode: "deep";
  stopReason: "satisfied" | "round_limit" | "no_progress" | "no_queries";
  retrievalRounds: number;
  incomplete: boolean;
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
  pendingEmailDraft: EmailDraft | null;
  messages: Message[];
  historyCursor: number | null;
  hasOlderMessages: boolean;
  isOlderMessagesLoading: boolean;
  olderMessagesError: string | null;
  isLoading: boolean;
  sessionId: string | null;
  sessions: HistorySession[];
  isSessionsLoading: boolean;
  abortController: AbortController | null;
  activeRequestId: string | null;
  addMessage: (message: NewMessage) => void;
  updateStreamingContent: (content: string, requestId?: string) => void;
  finishStreaming: (requestId?: string) => void;
  setThinking: (isThinking: boolean, text?: string, requestId?: string) => void;
  setDraftInput: (value: string) => void;
  openEmailDraft: (draft: EmailDraft) => void;
  closeEmailDraft: () => void;
  clearStopNotice: () => void;
  stopGenerating: () => void;
  prepareBook: (bookId: string) => Promise<void>;
  resetBookChat: () => void;
  fetchSessions: (bookId?: string) => Promise<void>;
  startNewSession: (bookId?: string) => Promise<string | null>;
  loadSession: (sessionId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  sendMessage: (
    content: string,
    spoilerOverride?: boolean,
    externalResearch?: boolean,
    retrievalMode?: "quick" | "deep",
  ) => Promise<void>;
}

const CHAT_INACTIVITY_TIMEOUT_MS = 30_000;
const HISTORY_PAGE_SIZE = 30;
let latestSessionLoadRequest = 0;
let latestOlderMessagesRequest = 0;

function mapHistoryItem(item: HistoryMessagePageItem): Message {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
  };
}

function historyMessagesUrl(sessionId: string, before?: number | null) {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (before != null) params.set("before", String(before));
  return `/api/chat/history/${sessionId}/messages?${params}`;
}

type LegacyHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

function sliceLegacyHistoryPage(
  sessionId: string,
  legacy: LegacyHistoryMessage[],
  before?: number | null,
): HistoryMessagePage {
  const total = legacy.length;
  let endExclusive = total;
  if (before != null) {
    if (!Number.isInteger(before) || before < 0 || before > total) {
      throw new Error("消息游标无效");
    }
    endExclusive = before;
  }
  if (endExclusive === 0) {
    return { items: [], nextCursor: null, hasMore: false };
  }
  const start = Math.max(0, endExclusive - HISTORY_PAGE_SIZE);
  const items = legacy.slice(start, endExclusive).map((message, offset) => {
    const position = start + offset;
    return {
      id: `${sessionId}:${position}`,
      position,
      role: message.role,
      content: message.content,
    };
  });
  const hasMore = start > 0;
  return {
    items,
    nextCursor: hasMore ? start : null,
    hasMore,
  };
}

async function fetchHistoryPage(
  sessionId: string,
  before?: number | null,
): Promise<HistoryMessagePage> {
  const response = await apiFetch(historyMessagesUrl(sessionId, before));
  if (response.status === 404) {
    const legacy = await readData<LegacyHistoryMessage[]>(
      await apiFetch(`/api/chat/history/${sessionId}`),
    );
    return sliceLegacyHistoryPage(sessionId, legacy, before);
  }
  return readData<HistoryMessagePage>(response);
}

async function readData<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = (await response.json()) as SuccessResponse<T>;
  return payload.data;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentBookId: null,
  draftInput: "",
  lastStopNotice: null,
  pendingEmailDraft: null,
  messages: [],
  historyCursor: null,
  hasOlderMessages: false,
  isOlderMessagesLoading: false,
  olderMessagesError: null,
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
        {
          ...message,
          id: message.id ?? createClientMessageId(),
          createdAt: message.createdAt ?? Date.now(),
        },
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
  openEmailDraft: (draft) =>
    set({ pendingEmailDraft: draft, lastStopNotice: null }),
  closeEmailDraft: () => set({ pendingEmailDraft: null }),
  clearStopNotice: () => set({ lastStopNotice: null }),

  stopGenerating: () => {
    const { abortController, activeRequestId } = get();
    if (!abortController) return;
    abortController.abort();
    set((state) => ({
      messages: state.messages.map((message, index) =>
        index === state.messages.length - 1
          ? { ...message, responseStatus: "cancelled" as const }
          : message,
      ),
    }));
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
      historyCursor: null,
      hasOlderMessages: false,
      isOlderMessagesLoading: false,
      olderMessagesError: null,
      draftInput: "",
      lastStopNotice: null,
      pendingEmailDraft: null,
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
      pendingEmailDraft: null,
      messages: [],
      historyCursor: null,
      hasOlderMessages: false,
      isOlderMessagesLoading: false,
      olderMessagesError: null,
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
        historyCursor: null,
        hasOlderMessages: false,
        isOlderMessagesLoading: false,
        olderMessagesError: null,
        lastStopNotice: null,
        pendingEmailDraft: null,
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
        ...(wasActive
          ? {
              sessionId: null,
              messages: [],
              historyCursor: null,
              hasOlderMessages: false,
              isOlderMessagesLoading: false,
              olderMessagesError: null,
            }
          : {}),
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
    latestOlderMessagesRequest += 1;
    const requestId = ++latestSessionLoadRequest;
    set({
      isLoading: true,
      sessionId,
      messages: [],
      historyCursor: null,
      hasOlderMessages: false,
      isOlderMessagesLoading: false,
      olderMessagesError: null,
      lastStopNotice: null,
      pendingEmailDraft: null,
    });
    try {
      const page = await fetchHistoryPage(sessionId);
      if (
        requestId === latestSessionLoadRequest &&
        get().sessionId === sessionId
      ) {
        set({
          messages: page.items.map(mapHistoryItem),
          historyCursor: page.nextCursor,
          hasOlderMessages: page.hasMore,
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

  loadOlderMessages: async () => {
    const {
      sessionId,
      historyCursor,
      hasOlderMessages,
      isOlderMessagesLoading,
    } = get();
    if (
      !sessionId ||
      !hasOlderMessages ||
      isOlderMessagesLoading ||
      historyCursor == null
    ) {
      return;
    }
    const sessionAtStart = sessionId;
    const requestId = ++latestOlderMessagesRequest;
    set({ isOlderMessagesLoading: true, olderMessagesError: null });
    try {
      const page = await fetchHistoryPage(sessionId, historyCursor);
      if (
        requestId !== latestOlderMessagesRequest ||
        get().sessionId !== sessionAtStart
      ) {
        return;
      }
      set((state) => {
        const existingIds = new Set(state.messages.map((message) => message.id));
        const older = page.items
          .filter((item) => !existingIds.has(item.id))
          .map(mapHistoryItem);
        return {
          messages: [...older, ...state.messages],
          historyCursor: page.nextCursor,
          hasOlderMessages: page.hasMore,
          isOlderMessagesLoading: false,
          olderMessagesError: null,
        };
      });
    } catch (error) {
      if (
        requestId === latestOlderMessagesRequest &&
        get().sessionId === sessionAtStart
      ) {
        set({
          isOlderMessagesLoading: false,
          olderMessagesError:
            error instanceof Error ? error.message : "加载较早消息失败",
        });
      }
    }
  },

  sendMessage: async (
    content,
    spoilerOverride = false,
    externalResearch = false,
    retrievalMode = "quick",
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
          ...(retrievalMode === "deep" ? { retrievalMode } : {}),
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
                emailDraft?: EmailDraft;
                memoryUpdate?: MemoryUpdateData;
                runSummary?: DeepRunSummary;
              };
              if (
                get().activeRequestId !== requestId ||
                abortController.signal.aborted
              )
                continue;
              if (data.runSummary) {
                const summary = data.runSummary;
                if (
                  summary.mode !== "deep" ||
                  ![
                    "satisfied",
                    "round_limit",
                    "no_progress",
                    "no_queries",
                  ].includes(summary.stopReason) ||
                  !Number.isInteger(summary.retrievalRounds) ||
                  summary.retrievalRounds < 1 ||
                  summary.retrievalRounds > 3 ||
                  typeof summary.incomplete !== "boolean"
                )
                  throw new Error("阅读助手返回了无效的分析状态");
                set((state) => {
                  if (state.activeRequestId !== requestId) return state;
                  const messages = [...state.messages];
                  const last = messages[messages.length - 1];
                  if (last?.role === "assistant")
                    messages[messages.length - 1] = {
                      ...last,
                      runSummary: summary,
                    };
                  return { messages };
                });
              }
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
              if (data.emailDraft) {
                set((state) =>
                  state.activeRequestId === requestId
                    ? {
                        pendingEmailDraft: data.emailDraft,
                        lastStopNotice: null,
                      }
                    : state,
                );
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
      bufferedContent = "";
      set((state) =>
        state.activeRequestId !== requestId
          ? state
          : {
              messages: state.messages.map((message, index) =>
                index === state.messages.length - 1
                  ? {
                      ...message,
                      responseStatus:
                        abortController.signal.aborted && !inactivityTimedOut
                          ? ("cancelled" as const)
                          : ("failed" as const),
                    }
                  : message,
              ),
            },
      );
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
