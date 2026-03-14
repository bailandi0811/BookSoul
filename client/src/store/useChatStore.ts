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
}

export type CharacterType = 'assistant' | 'qiaofeng' | 'duanyu' | 'wangyuyan';

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  currentCharacter: CharacterType;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string, references?: Reference[]) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  setCharacter: (character: CharacterType) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  currentCharacter: 'assistant',

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

  setLoading: (loading) => set({ isLoading: loading }),

  clearMessages: () => set({ messages: [] }),

  setCharacter: (character) => set({ currentCharacter: character }),

  sendMessage: async (content) => {
    const { addMessage, updateLastMessage, setLoading, currentCharacter } = get();
    
    // Add user message
    addMessage({ role: 'user', content });
    setLoading(true);

    // Add placeholder assistant message
    addMessage({ role: 'assistant', content: '' });

    try {
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, character: currentCharacter }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

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
                  updateLastMessage(assistantMessage, data.references);
                }
                
                // Handle content stream
                if (data.content) {
                  assistantMessage += data.content;
                  updateLastMessage(assistantMessage);
                }
              } catch (e) {
                console.error('Error parsing JSON chunk', e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      updateLastMessage('抱歉，发生了错误，请稍后再试。');
    } finally {
      setLoading(false);
    }
  },
}));
