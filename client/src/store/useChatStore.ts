import { create } from 'zustand';
import type { CharacterType } from '@/data/characters';

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
  role: 'user' | 'assistant';
  content: string;
  references?: Reference[];
  isStreaming?: boolean;
  isThinking?: boolean;
  thinkingText?: string;
  thinkingSteps?: string[];
  createdAt?: number;
}

export type ChatView = 'entrance' | 'dialogue';

const HAS_CHOSEN_KEY = 'booksoul_has_chosen';

function readHasChosen(): boolean {
  try {
    return localStorage.getItem(HAS_CHOSEN_KEY) === '1';
  } catch {
    return false;
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
  userId: string;
  sessions: HistorySession[];
  isSessionsLoading: boolean;
  abortController: AbortController | null;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string, references?: Reference[]) => void;
  updateStreamingContent: (content: string) => void;
  finishStreaming: () => void;
  setThinking: (isThinking: boolean, text?: string) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
  stopGenerating: () => void;
  clearMessages: () => void;
  setCharacter: (character: CharacterType) => void;
  setDraftInput: (value: string) => void;
  clearStopNotice: () => void;
  enterDialogue: (character: CharacterType) => void;
  switchCharacter: (character: CharacterType, opts?: { confirm?: boolean }) => void;
  openEntrance: () => void;
  fetchSessions: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

const initialHasChosen = typeof localStorage !== 'undefined' ? readHasChosen() : false;

export const useChatStore = create<ChatState>((set, get) => ({
  view: initialHasChosen ? 'dialogue' : 'entrance',
  hasChosenCharacter: initialHasChosen,
  draftInput: '',
  lastStopNotice: null,
  messages: [],
  isLoading: false,
  currentCharacter: 'assistant',
  sessionId: `session_${Date.now()}`,
  userId: 'anonymous',
  sessions: [],
  isSessionsLoading: false,
  abortController: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...message, createdAt: message.createdAt ?? Date.now() },
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

  updateStreamingContent: (newContent) =>
    set((state) => {
      const newMessages = [...state.messages];
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = newContent;
          lastMsg.isStreaming = true;
        }
      }
      return { messages: newMessages };
    }),

  finishStreaming: () =>
    set((state) => {
      const newMessages = [...state.messages];
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.isStreaming = false;
          lastMsg.isThinking = false;
        }
      }
      return { messages: newMessages, abortController: null };
    }),

  setThinking: (isThinking, text) =>
    set((state) => {
      const newMessages = [...state.messages];
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.isThinking = isThinking;
          if (text) {
            lastMsg.thinkingText = text;
            if (!lastMsg.thinkingSteps) {
              lastMsg.thinkingSteps = [];
            }
            if (lastMsg.thinkingSteps[lastMsg.thinkingSteps.length - 1] !== text) {
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
    const { abortController } = get();
    if (!abortController) return;
    abortController.abort();
    set({ lastStopNotice: '对话已止', isLoading: false });
    get().finishStreaming();
  },

  clearMessages: () => set({ messages: [], sessionId: `session_${Date.now()}` }),

  setCharacter: (character) => set({ currentCharacter: character }),

  enterDialogue: (character) => {
    try {
      localStorage.setItem(HAS_CHOSEN_KEY, '1');
    } catch {
      /* ignore */
    }
    set({
      view: 'dialogue',
      currentCharacter: character,
      hasChosenCharacter: true,
    });
  },

  switchCharacter: (character, opts) => {
    if (opts?.confirm) {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm('更换角色将开启新的对话，是否继续？');
      if (!ok) return;
    }
    set({
      currentCharacter: character,
      messages: [],
      sessionId: `session_${Date.now()}`,
      view: 'dialogue',
      hasChosenCharacter: true,
    });
    try {
      localStorage.setItem(HAS_CHOSEN_KEY, '1');
    } catch {
      /* ignore */
    }
  },

  openEntrance: () => set({ view: 'entrance' }),

  fetchSessions: async () => {
    set({ isSessionsLoading: true });
    try {
      const response = await fetch('/api/chat/history');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          set({ sessions: result.data });
        }
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      set({ isSessionsLoading: false });
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/history/${sessionId}`, {
        method: 'DELETE',
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
    set({ isLoading: true, sessionId, lastStopNotice: null });

    try {
      const response = await fetch(`/api/chat/history/${sessionId}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          set({ messages: result.data });
        }
      }
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
    } finally {
      set({ isLoading: false });
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
      userId,
      fetchSessions,
    } = get();

    get().stopGenerating();
    set({ lastStopNotice: null });

    const newAbortController = new AbortController();
    set({ abortController: newAbortController });

    addMessage({ role: 'user', content });
    addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
      isThinking: false,
      thinkingText: '',
      thinkingSteps: [],
    });
    setLoading(true);

    let assistantMessage = '';
    let bufferedContent = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let hasRenderedFirstToken = false;
    let lastThinkingAt = 0;
    let lastThinkingText = '';
    const THINKING_THROTTLE_MS = 350;
    const CONTENT_FLUSH_MS = 45;

    const flushBufferedContent = () => {
      if (!bufferedContent) return;
      assistantMessage += bufferedContent;
      bufferedContent = '';
      updateStreamingContent(assistantMessage);
    };

    const scheduleContentFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushBufferedContent();
      }, CONTENT_FLUSH_MS);
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          character: currentCharacter,
          sessionId: sessionId,
          userId: userId,
        }),
        signal: newAbortController.signal,
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let eventEndIndex;

          while ((eventEndIndex = buffer.indexOf('\n\n')) >= 0) {
            const eventStr = buffer.slice(0, eventEndIndex);
            buffer = buffer.slice(eventEndIndex + 2);

            const lines = eventStr.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (dataStr === '[DONE]') continue;

                try {
                  const data = JSON.parse(dataStr);

                  if (data.error) {
                    updateStreamingContent(`抱歉，发生错误：${data.error}`);
                    setLoading(false);
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
                      setThinking(true, data.thinking);
                    }
                  }

                  if (data.references) {
                    updateStreamingContent(assistantMessage);
                    set((state) => {
                      const newMessages = [...state.messages];
                      if (newMessages.length > 0) {
                        newMessages[newMessages.length - 1].references = data.references;
                      }
                      return { messages: newMessages };
                    });
                  }

                  if (data.content) {
                    if (!hasRenderedFirstToken) {
                      hasRenderedFirstToken = true;
                      setThinking(false);
                      assistantMessage += data.content;
                      updateStreamingContent(assistantMessage);
                    } else {
                      bufferedContent += data.content;
                      scheduleContentFlush();
                    }
                  }

                  if (data.metrics) {
                    console.debug('SSE metrics:', data.metrics);
                  }
                } catch (e) {
                  console.error('Parse error:', e, dataStr);
                }
              }
            }
          }
        }
        flushBufferedContent();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted');
      } else {
        console.error('Failed to send message:', error);
        updateStreamingContent('抱歉，发生了错误，请稍后再试。');
      }
    } finally {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushBufferedContent();
      finishStreaming();
      setLoading(false);
      fetchSessions();
    }
  },
}));
