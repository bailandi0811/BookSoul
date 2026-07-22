import { useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { getCharacter } from '@/data/characters';
import { motion, AnimatePresence } from 'framer-motion';

export const InputArea = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    isLoading,
    sendMessage,
    stopGenerating,
    draftInput,
    setDraftInput,
    currentCharacter,
    lastStopNotice,
    clearStopNotice,
  } = useChatStore();

  const character = getCharacter(currentCharacter);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [draftInput]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!lastStopNotice) return;
    const t = setTimeout(() => clearStopNotice(), 3000);
    return () => clearTimeout(t);
  }, [lastStopNotice, clearStopNotice]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftInput.trim() && !isLoading) {
      const text = draftInput;
      setDraftInput('');
      sendMessage(text);
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

  const canSend = draftInput.trim().length > 0 && !isLoading;

  return (
    <div className="relative z-20">
      <div className="mx-auto max-w-[42rem] px-4 sm:px-6 pb-5">
        <AnimatePresence>
          {lastStopNotice && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-3 mx-auto w-fit px-3.5 py-1.5 rounded-full text-xs text-muted-foreground bg-muted/70 border border-border"
            >
              {lastStopNotice}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, delay: 0.05 }}
          className="
            relative flex items-end gap-3
            rounded-[28px] border border-black/[0.06] dark:border-border
            bg-white dark:bg-card
            px-5 py-4
            shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.06)]
            focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.05),0_12px_32px_rgba(217,119,87,0.10)]
            transition-shadow duration-200
          "
        >
          <textarea
            id="chat-input"
            ref={inputRef}
            placeholder={character.placeholder}
            value={draftInput}
            onChange={(e) => setDraftInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
            aria-label="输入问题"
            className={`
              flex-1 resize-none bg-transparent border-0 outline-none shadow-none
              text-[16px] leading-[1.55] text-foreground placeholder:text-muted-foreground/50
              focus:outline-none focus:ring-0 focus:shadow-none
              focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none
              min-h-[28px] max-h-[200px] py-1
              disabled:opacity-50
            `}
            style={{ height: 'auto' }}
          />

          <div className="flex items-center flex-shrink-0 pb-0.5">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.button
                  key="stop"
                  type="button"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => stopGenerating()}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-border text-muted-foreground bg-secondary hover:bg-muted transition-all duration-200"
                  aria-label="停止生成"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  type="submit"
                  disabled={!canSend}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  whileHover={canSend ? { scale: 1.06 } : undefined}
                  whileTap={canSend ? { scale: 0.92 } : undefined}
                  className={`
                    w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200
                    ${canSend
                      ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(217,119,87,0.35)]'
                      : 'bg-[#eceae3] text-[#b0aea5] cursor-not-allowed dark:bg-muted dark:text-muted-foreground/35'
                    }
                  `}
                  aria-label="发送消息"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.form>

        <div className="flex items-center justify-center mt-2.5 text-[11px] text-muted-foreground/50 tracking-wide">
          <span>言出有据处，皆引自原著</span>
        </div>
      </div>
    </div>
  );
};
