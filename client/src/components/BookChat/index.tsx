import { useRef, useEffect, useState, useCallback } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { getCharacter } from '@/data/characters';
import { PanelLeftOpen, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageBubble } from './components/MessageBubble';
import { InputArea } from './components/InputArea';
import { Sidebar } from './components/Sidebar';
import { CharacterSwitchPanel } from './components/CharacterSwitchPanel';

const SIDEBAR_WIDTH_KEY = 'booksoul_sidebar_width';
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;

/** 默认 2:8 → 侧栏约占视口 20% */
function defaultSidebarWidth() {
  if (typeof window === 'undefined') return 280;
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(window.innerWidth * 0.2)));
}

function readSidebarWidth() {
  if (typeof localStorage === 'undefined') return defaultSidebarWidth();
  const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(raw)) return defaultSidebarWidth();
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, raw));
}

export default function BookChat() {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const currentCharacter = useChatStore((s) => s.currentCharacter);
  const character = getCharacter(currentCharacter);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX));
      sidebarWidthRef.current = next;
      setSidebarWidth(next);
    };

    const onUp = (ev: PointerEvent) => {
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      setIsResizing(false);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidthRef.current));
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }, []);

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] bg-background paper-bg text-foreground overflow-hidden">
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: sidebarWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={isResizing ? { duration: 0 } : { duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="relative h-full border-r border-border/60 bg-[#f0eee6] dark:bg-secondary z-30 flex-shrink-0 overflow-hidden"
          >
            <div className="h-full overflow-hidden" style={{ width: sidebarWidth }}>
              <Sidebar onClose={() => setIsSidebarOpen(false)} />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整侧栏宽度"
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              aria-valuenow={Math.round(sidebarWidth)}
              onPointerDown={onResizePointerDown}
              className={`
                absolute top-0 right-0 z-40 h-full w-1.5 -mr-0.5
                cursor-col-resize touch-none
                hover:bg-primary/25 active:bg-primary/40
                ${isResizing ? 'bg-primary/40' : 'bg-transparent'}
              `}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 relative h-full min-w-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(ellipse 80% 45% at 50% -10%, rgb(var(--primary) / 0.07), transparent 55%)',
          }}
        />
        <header className="relative flex items-center justify-center px-4 lg:px-6 z-20">
          {!isSidebarOpen && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setIsSidebarOpen(true)}
              className="absolute left-3 lg:left-4 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-xl transition-all duration-200"
              aria-label="打开侧边栏"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </motion.button>
          )}

          <div className="flex items-center gap-2.5 min-w-0 px-12 py-3">
            <span
              className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
              style={{ color: `rgb(var(${character.accentCssVar}))` }}
            >
              {character.sealChar}
            </span>
            <div className="min-w-0 text-center sm:text-left">
              <div className="flex items-baseline justify-center sm:justify-start gap-2 min-w-0">
                <h1 className="font-semibold text-[15px] text-foreground truncate tracking-tight">
                  {character.name}
                </h1>
                <span className="text-[12px] text-muted-foreground truncate hidden sm:inline">
                  {character.shortTitle}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSwitchOpen(true)}
              className="text-xs font-medium text-primary/90 hover:text-primary transition-colors flex-shrink-0 px-2 py-1 rounded-lg hover:bg-primary/5"
              title="更换角色"
            >
              换角
            </button>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => clearMessages()}
            className="absolute right-3 lg:right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-xl transition-all duration-200"
            title="新建对话"
            aria-label="新建对话"
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </header>

        <CharacterSwitchPanel open={switchOpen} onClose={() => setSwitchOpen(false)} />

        <div className="relative z-10 flex-1 overflow-hidden">
          <ScrollArea className="h-full chat-scrollbar" ref={scrollRef}>
            <div className="max-w-[42rem] mx-auto w-full px-4 sm:px-6 py-6">
              {messages.length === 0 && !isLoading ? (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="relative flex flex-col items-center justify-center min-h-[calc(100vh-11rem)] px-2"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-1/4 -translate-y-1/2 h-64 max-w-lg mx-auto rounded-full opacity-70"
                    style={{
                      background:
                        'radial-gradient(ellipse at center, rgb(var(--primary) / 0.10), transparent 68%)',
                    }}
                  />

                  <div className="relative text-center mb-9 max-w-lg">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="relative inline-flex mb-5"
                    >
                      <span
                        className="relative z-10 inline-flex w-16 h-16 items-center justify-center text-2xl font-bold rounded-full bg-card border border-border shadow-[0_8px_28px_-12px_rgb(var(--primary)/0.45)]"
                        style={{ color: `rgb(var(${character.accentCssVar}))` }}
                      >
                        {character.sealChar}
                      </span>
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-primary/15 blur-md scale-110"
                      />
                    </motion.div>
                    <p className="text-xs font-semibold tracking-wide text-primary mb-2">
                      {character.name}
                      <span className="text-muted-foreground font-medium"> · {character.shortTitle}</span>
                    </p>
                    <h2 className="text-xl sm:text-2xl font-semibold text-foreground leading-snug tracking-tight">
                      {character.greeting}
                    </h2>
                    <p className="mt-3 text-sm text-muted-foreground">点选下方问题，或直接输入开始对话</p>
                  </div>

                  <div className="relative w-full max-w-md space-y-2.5">
                    {character.suggestions.map((text, i) => (
                      <motion.button
                        key={text}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12 + i * 0.05, type: 'spring', stiffness: 320, damping: 24 }}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.985 }}
                        disabled={isLoading}
                        onClick={() => {
                          if (!isLoading) sendMessage(text);
                        }}
                        className="
                          w-full text-left px-4 py-3.5 rounded-2xl origin-center
                          text-sm font-medium text-foreground/90 leading-relaxed
                          bg-primary/[0.07] border border-primary/15
                          shadow-[0_1px_2px_rgb(217_119_87/0.06)]
                          hover:bg-primary/[0.18] hover:border-primary/40 hover:text-foreground
                          hover:shadow-[0_10px_28px_-12px_rgb(var(--primary)/0.5)]
                          transition-colors duration-200
                        "
                      >
                        {text}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-8 pb-8">
                  <AnimatePresence initial={false}>
                    {messages.map((msg, index) => (
                      <MessageBubble key={index} message={msg} />
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="relative z-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 inset-x-0 h-10 bg-gradient-to-t from-[rgb(var(--background))] to-transparent"
          />
          <InputArea />
        </div>
      </div>
    </div>
  );
}
