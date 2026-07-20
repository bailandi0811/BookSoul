import { useChatStore } from '@/store/useChatStore';
import { CHARACTER_IDS, getCharacter, SIDE_ABILITIES, QUICK_PROMPTS } from '@/data/characters';
import { PanelLeftClose, History, Bookmark, Moon, Sun, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { MemoryPanel } from './MemoryPanel';

export const Sidebar = ({ onClose }: { onClose: () => void }) => {
  const {
    currentCharacter,
    switchCharacter,
    setDraftInput,
    sessions,
    fetchSessions,
    loadSession,
    deleteSession,
    sessionId,
  } = useChatStore();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border/50">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base text-foreground tracking-wide">《天龙八部》</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              <span className="font-display">BookSoul</span>
              <span className="mx-1.5 text-border">·</span>
              书魂对话
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 rounded-sm transition-all duration-200"
            aria-label="关闭侧栏"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 py-4 scrollbar-thin">
        {/* 角色册 */}
        <div className="px-4 mb-6">
          <h3 className="text-[11px] font-semibold text-muted-foreground/70 tracking-wider mb-3 px-1 flex items-center gap-2">
            <Bookmark className="w-3 h-3" />
            角色册
          </h3>
          <div className="space-y-1.5">
            {CHARACTER_IDS.map((id, index) => {
              const char = getCharacter(id);
              const isActive = currentCharacter === id;

              return (
                <motion.button
                  key={id}
                  type="button"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => {
                    if (isActive) return;
                    switchCharacter(id, { confirm: true });
                  }}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-sm transition-all duration-200 text-left press-effect
                    ${isActive
                      ? 'bg-primary/8 border border-primary/25'
                      : 'hover:bg-muted/50 border border-transparent'
                    }
                  `}
                >
                  <span
                    className="seal-mark w-10 h-10 flex items-center justify-center text-base flex-shrink-0"
                    style={{ color: `rgb(var(${char.accentCssVar}))` }}
                  >
                    {char.sealChar}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {char.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                      {char.shortTitle}
                    </div>
                  </div>
                  {isActive && (
                    <motion.div
                      layoutId="activeCharacter"
                      className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* 书签 */}
        <div className="px-4 mb-6">
          <h3 className="text-[11px] font-semibold text-muted-foreground/70 tracking-wider mb-3 px-1 flex items-center gap-2">
            <History className="w-3 h-3" />
            书签
          </h3>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin">
            {!sessions || sessions.length === 0 ? (
              <div className="text-xs text-muted-foreground/50 text-center py-4">暂无书签</div>
            ) : (
              sessions.map((session, index) => {
                const isActive = session.sessionId === sessionId;
                return (
                  <motion.div
                    key={session.sessionId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => {
                      if (!isActive) loadSession(session.sessionId);
                    }}
                    className={`
                      w-full flex items-center gap-3 p-2.5 rounded-sm transition-all duration-200 text-left group cursor-pointer
                      ${isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                      }
                    `}
                  >
                    <Bookmark className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/50'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{session.title}</div>
                      <div className="text-[10px] opacity-60 mt-0.5">
                        {new Date(session.updatedAt).toLocaleString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.sessionId);
                      }}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-sm transition-all"
                      title="删除书签"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* 随身本事 */}
        <div className="px-4 mb-6">
          <h3 className="text-[11px] font-semibold text-muted-foreground/70 tracking-wider mb-3 px-1">
            随身本事
          </h3>
          <div className="space-y-1.5">
            {SIDE_ABILITIES.map((cap, index) => (
              <motion.div
                key={cap.name}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="p-3 rounded-sm border border-border/60 bg-secondary/30"
              >
                <div className="text-sm font-medium text-foreground">{cap.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{cap.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 快捷指令 */}
        <div className="px-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground/70 tracking-wider mb-3 px-1">
            快捷指令
          </h3>
          <div className="space-y-1.5">
            {QUICK_PROMPTS.map((text) => (
              <button
                key={text}
                type="button"
                className="w-full flex items-center gap-2.5 p-2.5 rounded-sm hover:bg-muted/50 transition-all duration-200 text-left group border border-transparent hover:border-border/50"
                onClick={() => setDraftInput(text)}
              >
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  {text}
                </span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>

      <MemoryPanel />

      <div className="p-4 border-t border-border/50">
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 rounded-sm transition-all duration-200 group"
        >
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground group-hover:text-foreground">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{isDark ? '日间纸色' : '夜读纸'}</span>
          </div>
          <div
            className={`
              w-9 h-5 rounded-full p-0.5 transition-colors duration-200
              ${isDark ? 'bg-primary' : 'bg-muted'}
            `}
          >
            <motion.div
              animate={{ x: isDark ? 16 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-4 h-4 rounded-full bg-white shadow-sm"
            />
          </div>
        </button>
      </div>
    </div>
  );
};
