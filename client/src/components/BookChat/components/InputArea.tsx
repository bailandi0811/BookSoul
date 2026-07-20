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
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-2 text-center text-xs text-muted-foreground"
            >
              {lastStopNotice}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="relative group"
        >
          <div
            className={`
            relative flex items-end rounded-sm border transition-all duration-300 input-glow
            ${canSend ? 'bg-card border-primary/30' : 'bg-card border-border/50'}
            focus-within:border-primary/40
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
                w-full resize-none bg-transparent px-4 pt-4 pb-3 pr-12
                text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60
                focus:outline-none min-h-[52px] max-h-[200px]
                disabled:opacity-50
              `}
              style={{ height: 'auto' }}
            />

            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.button
                    key="stop"
                    type="button"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    onClick={() => stopGenerating()}
                    className="p-2.5 border border-primary text-primary bg-background hover:bg-primary/5 rounded-sm transition-all duration-200 press-effect"
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
                      p-2.5 rounded-sm transition-all duration-200 press-effect
                      ${canSend
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
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

          <div className="flex items-center justify-center mt-3 text-[12px] text-muted-foreground/50">
            <span>言出有据处，皆引自原著</span>
          </div>
        </motion.form>
      </div>

      <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background/95 to-transparent pointer-events-none" />
    </div>
  );
};
