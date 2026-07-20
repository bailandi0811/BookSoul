import { CHARACTER_IDS, getCharacter, type CharacterType } from '@/data/characters';
import { useChatStore } from '@/store/useChatStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useState } from 'react';

interface CharacterSwitchPanelProps {
  open: boolean;
  onClose: () => void;
}

export function CharacterSwitchPanel({ open, onClose }: CharacterSwitchPanelProps) {
  const currentCharacter = useChatStore((s) => s.currentCharacter);
  const switchCharacter = useChatStore((s) => s.switchCharacter);
  const [pendingId, setPendingId] = useState<CharacterType | null>(null);

  const handleSelect = (id: CharacterType) => {
    if (id === currentCharacter) {
      onClose();
      return;
    }
    setPendingId(id);
  };

  const pending = pendingId ? getCharacter(pendingId) : null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6">
            <motion.button
              type="button"
              aria-label="关闭面板"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-foreground/20 backdrop-blur-[3px]"
              onClick={onClose}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="switch-character-title"
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="relative z-10 w-full max-w-md soft-surface rounded-[1.75rem] p-5 sm:p-6 max-h-[85vh] overflow-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3
                    id="switch-character-title"
                    className="font-display text-lg text-foreground tracking-wide"
                  >
                    更换角色
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">选择后将开启新的对话</p>
                </div>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onClose}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded-full transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              <div className="grid gap-2.5">
                {CHARACTER_IDS.map((id, i) => {
                  const c = getCharacter(id);
                  const isActive = currentCharacter === id;
                  return (
                    <motion.button
                      key={id}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 + i * 0.04 }}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => handleSelect(id)}
                      className={`
                        w-full flex items-center gap-3.5 p-3.5 text-left rounded-2xl border transition-colors
                        ${isActive
                          ? 'border-primary/35 bg-primary/[0.07] shadow-sm'
                          : 'border-transparent bg-muted/35 hover:bg-muted/55 hover:border-border/60'
                        }
                      `}
                    >
                      <span
                        className="seal-mark w-11 h-11 flex items-center justify-center text-base flex-shrink-0"
                        style={{ color: `rgb(var(${c.accentCssVar}))` }}
                      >
                        {c.sealChar}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-[15px] text-foreground">{c.name}</div>
                        <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                          {c.shortTitle}
                        </div>
                      </div>
                      {isActive && (
                        <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!pendingId}
        title={`改为与${pending?.name ?? ''}对话？`}
        description="将开启新的对话。当前内容仍可在侧栏「书签」中找回。"
        confirmLabel="开始新对话"
        cancelLabel="再想想"
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          if (!pendingId) return;
          switchCharacter(pendingId);
          setPendingId(null);
          onClose();
        }}
      />
    </>
  );
}
