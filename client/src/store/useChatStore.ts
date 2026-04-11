import { create } from 'zustand';

export interface Reference {
  book_name: string;
  chapter_num: number;
  content: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  references?: Reference[];
  isStreaming?: boolean; // 标记是否正在流式输出
  isThinking?: boolean; // 标记是否正在思考
}

export type CharacterType = 'assistant' | 'qiaofeng' | 'duanyu' | 'wangyuyan';

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  currentCharacter: CharacterType;
  sessionId: string; // 新增：会话ID
  abortController: AbortController | null;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string, references?: Reference[]) => void;
  updateStreamingContent: (content: string) => void; // 新增：流式更新内容
  finishStreaming: () => void; // 新增：结束流式输出
  setThinking: (isThinking: boolean) => void; // 新增：设置思考状态
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
  stopGenerating: () => void; // 新增：停止生成
  clearMessages: () => void;
  setCharacter: (character: CharacterType) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  currentCharacter: 'assistant',
  sessionId: `session_${Date.now()}`, // 默认随机生成一个 session id
  abortController: null,

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessage: (content, references) => set((state) => {
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

  // 流式更新：追加内容而不是替换
  updateStreamingContent: (newContent) => set((state) => {
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

  // 结束流式输出
  finishStreaming: () => set((state) => {
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

  // 设置思考状态
  setThinking: (isThinking) => set((state) => {
    const newMessages = [...state.messages];
    if (newMessages.length > 0) {
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg.role === 'assistant') {
        lastMsg.isThinking = isThinking;
      }
    }
    return { messages: newMessages };
  }),

  setLoading: (loading) => set({ isLoading: loading }),

  stopGenerating: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
  },

  clearMessages: () => set({ messages: [], sessionId: `session_${Date.now()}` }),

  setCharacter: (character) => set({ currentCharacter: character }),

  sendMessage: async (content) => {
    const { addMessage, updateStreamingContent, finishStreaming, setThinking, setLoading, currentCharacter, sessionId } = get();

    // 终止之前可能正在进行的请求
    get().stopGenerating();

    const newAbortController = new AbortController();
    set({ abortController: newAbortController });

    // Add user message
    addMessage({ role: 'user', content });
    // Add placeholder assistant message
    addMessage({ role: 'assistant', content: '', isStreaming: true, isThinking: true });
    setLoading(true);

    let assistantMessage = '';

    try {
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, character: currentCharacter, sessionId: sessionId }),
        signal: newAbortController.signal,
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (dataStr === '[DONE]') continue;

              try {
                const data = JSON.parse(dataStr);

                // Handle references data
                if (data.references) {
                  updateStreamingContent(assistantMessage); // 先保存当前内容再更新references
                  // 直接更新最后一条消息的references
                  set((state) => {
                    const newMessages = [...state.messages];
                    if (newMessages.length > 0) {
                      newMessages[newMessages.length - 1].references = data.references;
                    }
                    return { messages: newMessages };
                  });
                }

                // Handle content stream - 增量更新
                if (data.content) {
                  // 一旦有内容返回，就停止思考状态
                  setThinking(false);
                  assistantMessage += data.content;
                  updateStreamingContent(assistantMessage);
                }
              } catch (e) {
                // 忽略解析错误，继续处理下一个chunk
              }
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
        // 可选：你可以在这里更新一条状态告知用户“已停止生成”
      } else {
        console.error('Failed to send message:', error);
        updateStreamingContent('抱歉，发生了错误，请稍后再试。');
      }
    } finally {
      finishStreaming();
      setLoading(false);
    }
  },
}));
