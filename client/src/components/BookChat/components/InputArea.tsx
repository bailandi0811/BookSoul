import { useRef, useEffect } from 'react';
import { Send, StopCircle } from 'lucide-react';
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
      <div className="mx-auto max-w-3xl px-4 pb-4 md:pb-6">
        <AnimatePresence>
          {lastStopNotice && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-3 mx-auto w-fit px-3.5 py-1.5 rounded-full text-xs text-muted-foreground bg-muted/70 border border-border/50"
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
          className="relative group"
        >
          <div
            className={`
            relative flex items-end rounded-[1.75rem] border transition-all duration-300
            ${canSend
              ? 'bg-card border-primary/25 shadow-lg shadow-primary/5'
              : 'bg-card/90 border-border/50 shadow-md shadow-foreground/[0.03]'
            }
            focus-within:border-primary/35 focus-within:shadow-lg focus-within:shadow-primary/8
          `}
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
                w-full resize-none bg-transparent px-5 pt-4 pb-3.5 pr-14
                text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/55
                focus:outline-none min-h-[56px] max-h-[200px]
                disabled:opacity-50
              `}
              style={{ height: 'auto' }}
            />

            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1">
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
                    className="p-2.5 border border-primary/50 text-primary bg-background hover:bg-primary/5 rounded-full transition-all duration-200"
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
                    whileHover={canSend ? { scale: 1.06 } : undefined}
                    whileTap={canSend ? { scale: 0.92 } : undefined}
                    className={`
                      p-2.5 rounded-full transition-all duration-200
                      ${canSend
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                        : 'bg-muted text-muted-foreground/35 cursor-not-allowed'
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

          <div className="flex items-center justify-center mt-3 text-[12px] text-muted-foreground/45">
            <span>言出有据处，皆引自原著</span>
          </div>
        </motion.form>
      </div>
    </div>
  );
};
