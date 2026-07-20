import { CHARACTER_IDS, getCharacter, type CharacterType } from '@/data/characters';
import { useChatStore } from '@/store/useChatStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface CharacterSwitchPanelProps {
  open: boolean;
  onClose: () => void;
}

export function CharacterSwitchPanel({ open, onClose }: CharacterSwitchPanelProps) {
  const currentCharacter = useChatStore((s) => s.currentCharacter);
  const switchCharacter = useChatStore((s) => s.switchCharacter);

  const handleSelect = (id: CharacterType) => {
    if (id === currentCharacter) {
      onClose();
      return;
    }
    switchCharacter(id, { confirm: true });
    // 若用户取消 confirm，currentCharacter 不变，面板仍可关或保持；关闭以减少干扰
    if (useChatStore.getState().currentCharacter === id) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[min(100%-2rem,22rem)] bg-card border border-border shadow-lg rounded-sm p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base text-foreground">更换角色</h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-sm"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              {CHARACTER_IDS.map((id) => {
                const c = getCharacter(id);
                const isActive = currentCharacter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelect(id)}
                    className={`
                      w-full flex items-center gap-3 p-3 text-left rounded-sm border transition-colors
                      ${isActive
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-transparent hover:bg-muted/50'
                      }
                    `}
                  >
                    <span
                      className="seal-mark w-9 h-9 flex items-center justify-center text-sm flex-shrink-0"
                      style={{ color: `rgb(var(${c.accentCssVar}))` }}
                    >
                      {c.sealChar}
                    </span>
                    <div className="min-w-0">
                      <div className="font-display text-sm text-foreground">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.shortTitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
