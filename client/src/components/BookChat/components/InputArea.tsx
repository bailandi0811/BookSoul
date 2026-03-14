import { useRef, useEffect, useState } from 'react';
import { Send } from 'lucide-react';

interface InputAreaProps {
  isLoading: boolean;
  onSendMessage: (content: string) => void;
}

export const InputArea = ({ isLoading, onSendMessage }: InputAreaProps) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto resize input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [inputValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue);
      setInputValue('');
      if (inputRef.current) {
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

  // Expose setter for external control (like example questions)
  // Note: In a cleaner architecture, inputValue could be lifted up, 
  // but for now we'll keep local state and use a ref or just let parent pass initial value?
  // Actually, let's keep it simple. If parent needs to set value, we can add a prop or use a key to reset.
  // For the example questions, we might need to lift the state up.
  // Let's modify the props to accept value and setter if we want parent control,
  // OR just keep it self-contained and assume example questions will be handled differently.
  // Let's stick to the current pattern in index.tsx where state was local. 
  // Wait, in index.tsx state was in BookChat. Let's lift it back up or keep it here?
  // The original code had state in BookChat. To make this component reusable and controllable, 
  // we should probably accept value and onChange, or just use a ref.
  
  // Let's make it a controlled component to be safe.
  
  return (
    <div className="bg-[#F5F2E9] p-4 pb-8 sticky bottom-0 z-20">
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative group">
          <div className="relative flex items-end bg-[#FAF8F4] rounded-[24px] border border-[#E6DCC8] shadow-[0_8px_30px_-8px_rgba(44,24,16,0.12)] focus-within:border-[#D4C5A9] focus-within:shadow-[0_12px_40px_-10px_rgba(44,24,16,0.18)] transition-all duration-300 overflow-hidden">
            <textarea
              ref={inputRef}
              placeholder="在此输入问题，与书中人物对话..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
              className="w-full resize-none bg-transparent pl-6 pr-16 py-5 text-[#2C1810] placeholder:text-[#8B4513]/30 focus:outline-none min-h-[64px] max-h-[200px] text-[15px] font-serif leading-relaxed"
              style={{ height: 'auto' }}
            />
            <div className="absolute right-2 bottom-2">
              <button 
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className={`
                  w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
                  ${inputValue.trim() 
                    ? 'bg-[#2C1810] text-[#F5F2E9] hover:bg-[#4A3B32] shadow-md transform hover:scale-105 active:scale-95' 
                    : 'bg-[#E6DCC8]/50 text-[#F5F2E9] cursor-not-allowed'}
                `}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-[#F5F2E9]/30 border-t-[#F5F2E9] rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </button>
            </div>
          </div>
          <div className="text-center mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
            <span className="text-[10px] text-[#8B4513]/40 font-serif tracking-[0.3em] uppercase">
              — 阅 读 · 思 考 · 对 话 —
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};
