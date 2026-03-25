import { useRef, useEffect, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

export const InputArea = () => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { isLoading, sendMessage } = useChatStore();

  // Custom event listener for external updates
  useEffect(() => {
    const handleInputUpdate = () => {
      const el = document.getElementById('chat-input') as HTMLTextAreaElement;
      if (el && el.value !== inputValue) {
        setInputValue(el.value);
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 150) + 'px';
      }
    };
    
    document.addEventListener('input', handleInputUpdate);
    document.addEventListener('click', handleInputUpdate); // For button clicks
    return () => {
      document.removeEventListener('input', handleInputUpdate);
      document.removeEventListener('click', handleInputUpdate);
    };
  }, [inputValue]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [inputValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue);
      setInputValue('');
      if (inputRef.current) {
        inputRef.current.value = '';
        inputRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent sticky bottom-0 z-20">
      <div className="max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative flex items-end bg-white rounded-2xl border border-slate-200 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all duration-200 overflow-hidden">
            <textarea
              id="chat-input"
              ref={inputRef}
              placeholder="输入你的问题，例如：我在哪里？"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
              aria-label="输入问题"
              className="w-full resize-none bg-transparent pl-4 pr-14 py-3.5 text-slate-800 placeholder:text-slate-400 focus:outline-none min-h-[52px] max-h-[150px] text-[15px] leading-relaxed"
              style={{ height: 'auto' }}
            />
            <div className="absolute right-2 bottom-2">
              <button 
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                aria-label="发送"
                className={`
                  w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200
                  ${inputValue.trim() 
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' 
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'}
                `}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 mt-3 text-[11px] text-slate-400 font-medium">
            <Sparkles className="w-3 h-3" />
            AI 生成内容仅供参考
          </div>
        </form>
      </div>
    </div>
  );
};