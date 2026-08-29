import { create } from "zustand";
import { CHARACTER_IDS, type CharacterType } from "@/data/characters";
import { apiFetch } from "@/lib/api";
import { useMemoryStore } from "@/store/useMemoryStore";

export type { CharacterType };

export interface Reference {
  book_name: string;
  chapter_num: number;
  content: string;
}

export interface HistorySession {
  sessionId: string;
  title: string;
  updatedAt: number;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  references?: Reference[];
  isStreaming?: boolean;
  isThinking?: boolean;
  thinkingText?: string;
  thinkingSteps?: string[];
  createdAt?: number;
  /** 发送时的角色；历史消息可能缺失，UI 回退到 currentCharacter */
  characterId?: CharacterType;
}

export type ChatView = "entrance" | "dialogue";

const HAS_CHOSEN_KEY = "booksoul_has_chosen";
const CHARACTER_KEY = "booksoul_character";
const CHAT_INACTIVITY_TIMEOUT_MS = 30_000;
let latestSessionLoadRequest = 0;

function isCharacterType(value: string | null): value is CharacterType {
  return !!value && (CHARACTER_IDS as string[]).includes(value);
}

function readHasChosen(): boolean {
  try {
    return localStorage.getItem(HAS_CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

function readStoredCharacter(): CharacterType {
  try {
    const raw = localStorage.getItem(CHARACTER_KEY);
    if (isCharacterType(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "assistant";
}

function persistChosenCharacter(character: CharacterType) {
  try {
    localStorage.setItem(HAS_CHOSEN_KEY, "1");
    localStorage.setItem(CHARACTER_KEY, character);
  } catch {
    /* ignore */
  }
}

interface ChatState {
  view: ChatView;
  hasChosenCharacter: boolean;
  draftInput: string;
  lastStopNotice: string | null;
  messages: Message[];
  isLoading: boolean;
  currentCharacter: CharacterType;
  sessionId: string;
  sessions: HistorySession[];
  isSessionsLoading: boolean;
  abortController: AbortController | null;
  activeRequestId: string | null;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string, references?: Reference[]) => void;
  updateStreamingContent: (content: string, requestId?: string) => void;
  finishStreaming: (requestId?: string) => void;
  setThinking: (isThinking: boolean, text?: string, requestId?: string) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
  stopGenerating: () => void;
  clearMessages: () => void;
  setCharacter: (character: CharacterType) => void;
  setDraftInput: (value: string) => void;
  clearStopNotice: () => void;
  enterDialogue: (character: CharacterType) => void;
  switchCharacter: (
    character: CharacterType,
    opts?: { confirm?: boolean },
  ) => void;
  openEntrance: () => void;
  fetchSessions: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

const initialHasChosen =
  typeof localStorage !== "undefined" ? readHasChosen() : false;
const initialCharacter =
  typeof localStorage !== "undefined" ? readStoredCharacter() : "assistant";

export const useChatStore = create<ChatState>((set, get) => ({
  view: initialHasChosen ? "dialogue" : "entrance",
  hasChosenCharacter: initialHasChosen,
  draftInput: "",
  lastStopNotice: null,
  messages: [],
  isLoading: false,
  currentCharacter: initialCharacter,
  sessionId: `session_${Date.now()}`,
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
          createdAt: message.createdAt ?? Date.now(),
          characterId: message.characterId ?? state.currentCharacter,
        },
      ],
    })),

  updateLastMessage: (content, references) =>
    set((state) => {
      const newMessages = [...state.messages];
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        lastMsg.content = content;
        if (references) {
          lastMsg.references = references;
        }
      }
      return { messages: newMessages };
    }),

  updateStreamingContent: (newContent, requestId) =>
    set((state) => {
      if (requestId && state.activeRequestId !== requestId) return state;
      const newMessages = [...state.messages];
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === "assistant") {
          lastMsg.content = newContent;
          lastMsg.isStreaming = true;
        }
      }
      return { messages: newMessages };
    }),

  finishStreaming: (requestId) =>
    set((state) => {
      if (requestId && state.activeRequestId !== requestId) return state;
      const newMessages = [...state.messages];
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === "assistant") {
          lastMsg.isStreaming = false;
          lastMsg.isThinking = false;
        }
      }
      return {
        messages: newMessages,
        abortController: null,
        activeRequestId: null,
      };
    }),

  setThinking: (isThinking, text, requestId) =>
    set((state) => {
      if (requestId && state.activeRequestId !== requestId) return state;
      const newMessages = [...state.messages];
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === "assistant") {
          lastMsg.isThinking = isThinking;
          if (text) {
            lastMsg.thinkingText = text;
            if (!lastMsg.thinkingSteps) {
              lastMsg.thinkingSteps = [];
            }
            if (
              lastMsg.thinkingSteps[lastMsg.thinkingSteps.length - 1] !== text
            ) {
              lastMsg.thinkingSteps.push(text);
            }
          }
        }
      }
      return { messages: newMessages };
    }),

  setLoading: (loading) => set({ isLoading: loading }),

  setDraftInput: (value) => set({ draftInput: value }),

  clearStopNotice: () => set({ lastStopNotice: null }),

  stopGenerating: () => {
    const { abortController, activeRequestId } = get();
    if (!abortController) return;
    abortController.abort();
    get().finishStreaming(activeRequestId ?? undefined);
    set({ lastStopNotice: "对话已止", isLoading: false });
  },

  clearMessages: () => {
    latestSessionLoadRequest += 1;
    get().stopGenerating();
    set({
      messages: [],
      sessionId: `session_${Date.now()}`,
      isLoading: false,
      abortController: null,
      activeRequestId: null,
    });
  },

  setCharacter: (character) => {
    persistChosenCharacter(character);
    set({ currentCharacter: character, hasChosenCharacter: true });
  },

  enterDialogue: (character) => {
    persistChosenCharacter(character);
    set({
      view: "dialogue",
      currentCharacter: character,
      hasChosenCharacter: true,
    });
  },

  switchCharacter: (character, opts) => {
    if (opts?.confirm) {
      const ok =
        typeof window !== "undefined" &&
        window.confirm("更换角色将开启新的对话，是否继续？");
      if (!ok) return;
    }
    get().stopGenerating();
    latestSessionLoadRequest += 1;
    persistChosenCharacter(character);
    set({
      currentCharacter: character,
      messages: [],
      sessionId: `session_${Date.now()}`,
      view: "dialogue",
      hasChosenCharacter: true,
      isLoading: false,
      abortController: null,
      activeRequestId: null,
    });
  },

  openEntrance: () => set({ view: "entrance" }),

  fetchSessions: async () => {
    set({ isSessionsLoading: true });
    try {
      const response = await apiFetch("/api/chat/history");
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          set({ sessions: result.data });
        }
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      set({ isSessionsLoading: false });
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      const response = await apiFetch(`/api/chat/history/${sessionId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await get().fetchSessions();
          if (get().sessionId === sessionId) {
            get().clearMessages();
          }
        }
      }
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
    }
  },

  loadSession: async (sessionId: string) => {
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
      const response = await apiFetch(`/api/chat/history/${sessionId}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          if (
            requestId === latestSessionLoadRequest &&
            get().sessionId === sessionId
          ) {
            set({ messages: result.data });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
    } finally {
      if (
        requestId === latestSessionLoadRequest &&
        get().sessionId === sessionId
      ) {
        set({ isLoading: false });
      }
    }
  },

  sendMessage: async (content) => {
    const {
      addMessage,
      updateStreamingContent,
      finishStreaming,
      setThinking,
      setLoading,
      currentCharacter,
      sessionId,
      fetchSessions,
    } = get();

    latestSessionLoadRequest += 1;
    get().stopGenerating();
    set({ lastStopNotice: null });

    const newAbortController = new AbortController();
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random()}`;
    set({ abortController: newAbortController, activeRequestId: requestId });

    addMessage({ role: "user", content });
    addMessage({
      role: "assistant",
      content: "",
      isStreaming: true,
      isThinking: false,
      thinkingText: "",
      thinkingSteps: [],
    });
    setLoading(true);

    let assistantMessage = "";
    let bufferedContent = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let hasRenderedFirstToken = false;
    let lastThinkingAt = 0;
    let lastThinkingText = "";
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let inactivityTimedOut = false;
    const THINKING_THROTTLE_MS = 350;
    const CONTENT_FLUSH_MS = 45;

    const armInactivityTimeout = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        inactivityTimedOut = true;
        newAbortController.abort();
      }, CHAT_INACTIVITY_TIMEOUT_MS);
    };

    const flushBufferedContent = () => {
      if (!bufferedContent) return;
      assistantMessage += bufferedContent;
      bufferedContent = "";
      updateStreamingContent(assistantMessage, requestId);
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
          character: currentCharacter,
          sessionId: sessionId,
        }),
        signal: newAbortController.signal,
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armInactivityTimeout();

          buffer += decoder.decode(value, { stream: true });
          let eventEndIndex;

          while ((eventEndIndex = buffer.indexOf("\n\n")) >= 0) {
            const eventStr = buffer.slice(0, eventEndIndex);
            buffer = buffer.slice(eventEndIndex + 2);

            const lines = eventStr.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const dataStr = line.slice(6).trim();
                if (dataStr === "[DONE]") continue;

                try {
                  const data = JSON.parse(dataStr);

                  if (data.error) {
                    updateStreamingContent(
                      `抱歉，发生错误：${data.error}`,
                      requestId,
                    );
                    return;
                  }

                  if (data.thinking) {
                    const now = Date.now();
                    if (
                      data.thinking !== lastThinkingText &&
                      now - lastThinkingAt >= THINKING_THROTTLE_MS &&
                      !hasRenderedFirstToken
                    ) {
                      lastThinkingAt = now;
                      lastThinkingText = data.thinking;
                      setThinking(true, data.thinking, requestId);
                    }
                  }

                  if (data.references) {
                    updateStreamingContent(assistantMessage, requestId);
                    set((state) => {
                      if (state.activeRequestId !== requestId) return state;
                      const newMessages = [...state.messages];
                      if (newMessages.length > 0) {
                        newMessages[newMessages.length - 1].references =
                          data.references;
                      }
                      return { messages: newMessages };
                    });
                  }

                  if (data.content) {
                    if (!hasRenderedFirstToken) {
                      hasRenderedFirstToken = true;
                      setThinking(false, undefined, requestId);
                      assistantMessage += data.content;
                      updateStreamingContent(assistantMessage, requestId);
                    } else {
                      bufferedContent += data.content;
                      scheduleContentFlush();
                    }
                  }

                  if (data.metrics) {
                    console.debug("SSE metrics:", data.metrics);
                  }

                  if (data.memoryUpdate) {
                    useMemoryStore
                      .getState()
                      .handleMemoryUpdate(data.memoryUpdate);
                  }
                } catch (e) {
                  console.error("Parse error:", e, dataStr);
                }
              }
            }
          }
        }
        flushBufferedContent();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (inactivityTimedOut) {
          updateStreamingContent(
            "AI 服务长时间没有响应，请检查模型 Key、服务额度、网络或向量数据库连接后重试。",
            requestId,
          );
        } else {
          console.log("Request was aborted");
        }
      } else {
        console.error("Failed to send message:", error);
        updateStreamingContent("抱歉，发生了错误，请稍后再试。", requestId);
      }
    } finally {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      if (get().activeRequestId === requestId) {
        flushBufferedContent();
        finishStreaming(requestId);
        setLoading(false);
        fetchSessions();
      }
    }
  },
}));
