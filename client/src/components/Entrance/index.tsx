import { useState } from 'react';
import { motion } from 'framer-motion';
import { CHARACTER_IDS, getCharacter, type CharacterType } from '@/data/characters';
import { useChatStore } from '@/store/useChatStore';

export function Entrance() {
  const enterDialogue = useChatStore((s) => s.enterDialogue);
  const [selected, setSelected] = useState<CharacterType | null>(null);

  return (
    <div className="paper-bg min-h-screen w-full flex flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="text-center mb-12 max-w-xl"
      >
        <h1 className="font-display text-5xl sm:text-6xl tracking-wide text-foreground mb-4">
          BookSoul
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
          赋予书籍灵魂，与书中人对话
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mb-10">
        {CHARACTER_IDS.map((id, i) => {
          const c = getCharacter(id);
          const isSelected = selected === id;
          return (
            <motion.button
              key={id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.4 }}
              onClick={() => setSelected(id)}
              className={`
                flex items-center gap-4 p-4 text-left transition-colors press-effect
                border rounded-sm
                ${isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border/80 hover:border-foreground/30 bg-card/60'
                }
              `}
            >
              <span
                className="seal-mark w-11 h-11 flex items-center justify-center text-lg flex-shrink-0"
                style={{ color: `rgb(var(${c.accentCssVar}))` }}
              >
                {c.sealChar}
              </span>
              <div className="min-w-0">
                <div className="font-display text-lg text-foreground">{c.name}</div>
                <div className="text-sm text-muted-foreground mt-0.5 truncate">{c.shortTitle}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        disabled={!selected}
        onClick={() => selected && enterDialogue(selected)}
        className={`
          px-10 py-3 font-display text-base tracking-wide rounded-sm transition-colors
          ${selected
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted text-muted-foreground/50 cursor-not-allowed'
          }
        `}
      >
        开始对话
      </motion.button>
    </div>
  );
}
