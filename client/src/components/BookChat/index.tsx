import { useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { getCharacter } from '@/data/characters';
import { PanelLeftOpen, Plus, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageBubble } from './components/MessageBubble';
import { InputArea } from './components/InputArea';
import { Sidebar } from './components/Sidebar';
import { CharacterSwitchPanel } from './components/CharacterSwitchPanel';

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <div className="flex h-screen paper-bg text-foreground overflow-hidden">
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="h-full border-r border-border/50 bg-card z-30 flex-shrink-0 overflow-hidden"
          >
            <Sidebar onClose={() => setIsSidebarOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 relative h-full min-w-0">
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {!isSidebarOpen && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm transition-all duration-200"
                aria-label="打开侧边栏"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </motion.button>
            )}

            <div className="flex items-center gap-3 min-w-0">
              <span
                className="seal-mark w-9 h-9 flex items-center justify-center text-base flex-shrink-0"
                style={{ color: `rgb(var(${character.accentCssVar}))` }}
              >
                {character.sealChar}
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-lg text-foreground tracking-wide truncate">
                  {character.name}
                </h1>
                <p className="text-[11px] text-muted-foreground truncate">{character.shortTitle}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <span className="hidden md:inline text-[11px] text-muted-foreground/50 font-display mr-1">
              BookSoul
            </span>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSwitchOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm transition-all duration-200"
              title="更换角色"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">更换角色</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => clearMessages()}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm transition-all duration-200"
              title="新建对话"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">新对话</span>
            </motion.button>
          </div>
        </header>

        <CharacterSwitchPanel open={switchOpen} onClose={() => setSwitchOpen(false)} />

        <div className="flex-1 overflow-hidden relative">
          <ScrollArea className="h-full chat-scrollbar" ref={scrollRef}>
            <div className="max-w-3xl mx-auto w-full py-8 min-h-[calc(100vh-150px)]">
              {messages.length === 0 && !isLoading ? (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center justify-center min-h-[60vh] px-4"
                >
                  <div className="text-center mb-10 max-w-lg">
                    <span
                      className="seal-mark inline-flex w-14 h-14 items-center justify-center text-2xl mb-6"
                      style={{ color: `rgb(var(${character.accentCssVar}))` }}
                    >
                      {character.sealChar}
                    </span>
                    <h2 className="font-display text-xl sm:text-2xl text-foreground mb-3 leading-relaxed">
                      {character.greeting}
                    </h2>
                  </div>

                  <div className="w-full max-w-xl space-y-2">
                    {character.suggestions.map((text, i) => (
                      <motion.button
                        key={text}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.05 }}
                        whileTap={{ scale: 0.99 }}
                        disabled={isLoading}
                        onClick={() => {
                          if (!isLoading) sendMessage(text);
                        }}
                        className="
                          w-full text-left px-4 py-3 rounded-sm border border-border/70
                          bg-card/50 hover:bg-secondary/60 hover:border-border
                          text-sm text-foreground transition-colors press-effect
                        "
                      >
                        {text}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-6 pb-4">
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

        <div className="relative">
          <InputArea />
        </div>
      </div>
    </div>
  );
}
