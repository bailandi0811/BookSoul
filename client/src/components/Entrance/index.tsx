import { useState } from 'react';
import { motion } from 'framer-motion';
import { CHARACTER_IDS, getCharacter, type CharacterType } from '@/data/characters';
import { useChatStore } from '@/store/useChatStore';

export function Entrance() {
  const enterDialogue = useChatStore((s) => s.enterDialogue);
  const [selected, setSelected] = useState<CharacterType | null>(null);

  return (
    <div className="paper-bg min-h-screen w-full flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgb(var(--primary) / 0.06), transparent 60%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="relative text-center mb-12 max-w-xl"
      >
        <h1 className="font-display text-5xl sm:text-6xl tracking-wide text-foreground mb-4">
          BookSoul
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
          赋予书籍灵魂，与书中人对话
        </p>
      </motion.div>

      <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full max-w-2xl mb-10">
        {CHARACTER_IDS.map((id, i) => {
          const c = getCharacter(id);
          const isSelected = selected === id;
          return (
            <motion.button
              key={id}
              type="button"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 + i * 0.05, type: 'spring', stiffness: 320, damping: 26 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelected(id)}
              className={`
                flex items-center gap-4 p-4 text-left rounded-3xl border transition-colors
                ${isSelected
                  ? 'border-primary/40 bg-primary/[0.07] shadow-md shadow-primary/10'
                  : 'border-border/50 bg-card/70 hover:border-border hover:bg-card'
                }
              `}
            >
              <span
                className="seal-mark w-12 h-12 flex items-center justify-center text-lg flex-shrink-0"
                style={{ color: `rgb(var(${c.accentCssVar}))` }}
              >
                {c.sealChar}
              </span>
              <div className="min-w-0">
                <div className="font-display text-lg text-foreground">{c.name}</div>
                <div className="text-sm text-muted-foreground mt-0.5 truncate">{c.shortTitle}</div>
              </div>
              {isSelected && (
                <motion.span
                  layoutId="entrance-selected"
                  className="ml-auto w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, type: 'spring', stiffness: 300, damping: 24 }}
        whileHover={selected ? { scale: 1.03, y: -1 } : undefined}
        whileTap={selected ? { scale: 0.97 } : undefined}
        disabled={!selected}
        onClick={() => selected && enterDialogue(selected)}
        className={`
          relative px-12 py-3.5 font-display text-base tracking-wide rounded-full transition-colors
          ${selected
            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
            : 'bg-muted text-muted-foreground/45 cursor-not-allowed'
          }
        `}
      >
        开始对话
      </motion.button>
    </div>
  );
}
