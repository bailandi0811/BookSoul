import { useChatStore } from '@/store/useChatStore';
import { CHARACTER_IDS, getCharacter, SIDE_ABILITIES, QUICK_PROMPTS, type CharacterType } from '@/data/characters';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PanelLeftClose, History, Moon, Sun, Trash2 } from 'lucide-react';
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
    clearMessages,
  } = useChatStore();
  const [isDark, setIsDark] = useState(false);
  const [pendingChar, setPendingChar] = useState<CharacterType | null>(null);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  const pending = pendingChar ? getCharacter(pendingChar) : null;

  return (
    <div className="flex flex-col h-full w-full bg-secondary border-r border-border">
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-base text-foreground tracking-tight">BookSoul</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">天龙八部</p>
          </div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            onClick={onClose}
            className="p-2 text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 rounded-xl transition-all duration-200"
            aria-label="关闭侧栏"
          >
            <PanelLeftClose className="w-4 h-4" />
          </motion.button>
        </div>
        <button
          type="button"
          onClick={() => clearMessages()}
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm font-semibold hover:bg-secondary/80 transition-colors"
        >
          ＋ 新对话
        </button>
      </div>

      <ScrollArea className="flex-1 py-4 scrollbar-thin">
        <div className="px-4 mb-6">
          <h3 className="text-[11px] font-bold text-muted-foreground tracking-wider mb-3 px-1">
            角色
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
                  transition={{ delay: index * 0.04 }}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => {
                    if (isActive) return;
                    setPendingChar(id);
                  }}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left
                    ${isActive
                      ? 'border border-primary bg-card shadow-sm'
                      : 'hover:bg-muted/55 border border-transparent'
                    }
                  `}
                >
                  <span
                    className="seal-mark w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                    style={{ color: `rgb(var(${char.accentCssVar}))` }}
                  >
                    {char.sealChar}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {char.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                      {char.shortTitle}
                    </div>
                  </div>
                  {isActive && (
                    <motion.div
                      layoutId="activeCharacter"
                      className="w-2 h-2 rounded-full bg-primary flex-shrink-0"
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="px-4 mb-6">
          <h3 className="text-[11px] font-bold text-muted-foreground tracking-wider mb-3 px-1 flex items-center gap-2">
            <History className="w-3 h-3" />
            会话
          </h3>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin">
            {!sessions || sessions.length === 0 ? (
              <div className="text-xs text-muted-foreground/50 text-center py-4">暂无会话</div>
            ) : (
              sessions.map((session, index) => {
                const isActive = session.sessionId === sessionId;
                return (
                  <motion.div
                    key={session.sessionId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      if (!isActive) loadSession(session.sessionId);
                    }}
                    className={`
                      w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 text-left group cursor-pointer
                      ${isActive
                        ? 'bg-card border border-border text-foreground font-semibold shadow-sm'
                        : 'hover:bg-muted/55 text-muted-foreground hover:text-foreground border border-transparent'
                      }
                    `}
                  >
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
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl transition-all"
                      title="删除会话"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        <div className="px-4 mb-6">
          <h3 className="text-[11px] font-bold text-muted-foreground tracking-wider mb-3 px-1">
            随身本事
          </h3>
          <div className="space-y-2">
            {SIDE_ABILITIES.map((cap, index) => (
              <motion.div
                key={cap.name}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + index * 0.04 }}
                className="p-3.5 rounded-xl border border-border/50 bg-card/60"
              >
                <div className="text-sm font-medium text-foreground">{cap.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{cap.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="px-4">
          <h3 className="text-[11px] font-bold text-muted-foreground tracking-wider mb-3 px-1">
            快捷指令
          </h3>
          <div className="space-y-1.5">
            {QUICK_PROMPTS.map((text) => (
              <motion.button
                key={text}
                type="button"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.985 }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-muted/55 transition-all duration-200 text-left group border border-transparent hover:border-border/40"
                onClick={() => setDraftInput(text)}
              >
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  {text}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </ScrollArea>

      <MemoryPanel />

      <div className="p-4 border-t border-border/40">
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={toggleTheme}
          className="w-full flex items-center justify-between p-2.5 hover:bg-muted/55 rounded-xl transition-all duration-200 group"
        >
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground group-hover:text-foreground">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{isDark ? '浅色' : '暗色'}</span>
          </div>
          <div
            className={`
              w-10 h-6 rounded-full p-0.5 transition-colors duration-200
              ${isDark ? 'bg-primary' : 'bg-muted'}
            `}
          >
            <motion.div
              animate={{ x: isDark ? 16 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-5 h-5 rounded-full bg-white shadow-sm"
            />
          </div>
        </motion.button>
      </div>

      <ConfirmDialog
        open={!!pendingChar}
        title={`改为与${pending?.name ?? ''}对话？`}
        description="将开启新的对话。当前内容仍可在侧栏「会话」中找回。"
        confirmLabel="开始新对话"
        cancelLabel="再想想"
        onCancel={() => setPendingChar(null)}
        onConfirm={() => {
          if (!pendingChar) return;
          switchCharacter(pendingChar);
          setPendingChar(null);
        }}
      />
    </div>
  );
};
