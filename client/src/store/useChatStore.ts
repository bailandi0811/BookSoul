import { create } from 'zustand';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [
    { role: 'assistant', content: '你好！我是你的《天龙八部》阅读伴侣。有什么想问的吗？你可以问我关于书中人物、情节或武功的问题。' }
  ],
  isLoading: false,

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessage: (content) => set((state) => {
    const newMessages = [...state.messages];
    if (newMessages.length > 0) {
      newMessages[newMessages.length - 1].content = content;
    }
    return { messages: newMessages };
  }),

  setLoading: (loading) => set({ isLoading: loading }),

  sendMessage: async (content) => {
    const { addMessage, updateLastMessage, setLoading } = get();
    
    // Add user message
    addMessage({ role: 'user', content });
    setLoading(true);

    // Add placeholder assistant message
    addMessage({ role: 'assistant', content: '' });

    try {
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
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
