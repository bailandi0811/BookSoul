import { useRef, useEffect, useState } from 'react';
import { Send, Sparkles, StopCircle } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { motion, AnimatePresence } from 'framer-motion';

export const InputArea = () => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { isLoading, sendMessage, stopGenerating } = useChatStore();

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [inputValue]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const canSend = inputValue.trim().length > 0 && !isLoading;

  return (
    <div className="relative z-20">
      {/* Main input container */}
      <div className="mx-auto max-w-3xl px-4 pb-4 md:pb-6">
        <motion.form
          onSubmit={handleSubmit}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="relative group"
        >
          {/* Input wrapper with glow effect */}
          <div className={`
            relative flex items-end rounded-2xl border transition-all duration-300
            ${canSend
              ? 'bg-card border-primary/20 shadow-lg shadow-primary/5'
              : 'bg-card border-border/50'
            }
            focus-within:border-primary/40 focus-within:shadow-xl focus-within:shadow-primary/10
          `}>
            {/* Textarea */}
            <textarea
              id="chat-input"
              ref={inputRef}
              placeholder="输入你的问题，让AI为你解答..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
              aria-label="输入问题"
              className={`
                w-full resize-none bg-transparent px-4 pt-4 pb-3 pr-12
                text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60
                focus:outline-none min-h-[52px] max-h-[200px]
                disabled:opacity-50
              `}
              style={{ height: 'auto' }}
            />

            {/* Action buttons container */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {/* Send / Stop button */}
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.button
                    key="stop"
                    type="button"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    onClick={() => stopGenerating()}
                    className="p-2.5 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl shadow-lg shadow-red-500/20 transition-all duration-200 press-effect"
                    aria-label="停止生成"
                  >
                    <StopCircle className="w-4 h-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    type="submit"
                    disabled={!canSend}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className={`
                      p-2.5 rounded-xl transition-all duration-200 press-effect
                      ${canSend
                        ? 'bg-gradient-to-br from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
                      }
                    `}
                    aria-label="发送消息"
                  >
                    <Send className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-center gap-2 mt-3 text-[12px] text-muted-foreground/40">
            <Sparkles className="w-3 h-3" />
            <span>AI助手基于《天龙八部》提供智能问答服务</span>
          </div>
        </motion.form>
      </div>

      {/* Gradient fade at top when scrolling */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background/95 to-transparent pointer-events-none" />
    </div>
  );
};
