import { useState } from 'react';
import { motion } from 'framer-motion';
import { CHARACTER_IDS, getCharacter, type CharacterType } from '@/data/characters';
import { useChatStore } from '@/store/useChatStore';

export function Entrance() {
  const enterDialogue = useChatStore((s) => s.enterDialogue);
  const [selected, setSelected] = useState<CharacterType>('assistant');

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="text-center mb-10 max-w-xl"
      >
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground mb-4">
          BookSoul
        </h1>
        <p className="text-muted-foreground font-medium text-base sm:text-lg">
          赋予书籍灵魂，与书中人对话
        </p>
      </motion.div>

      <div className="flex flex-wrap justify-center gap-3 mb-10">
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
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelected(id)}
              className={`
                flex flex-col items-center gap-2 p-3 rounded-2xl transition-colors w-[96px] sm:w-[104px]
                ${isSelected
                  ? 'border-2 border-primary bg-card'
                  : 'border border-border bg-secondary'
                }
              `}
            >
              <span
                className="avatar-mark seal-mark w-9 h-9 flex items-center justify-center text-sm flex-shrink-0"
                style={{ color: `rgb(var(${c.accentCssVar}))` }}
              >
                {c.sealChar}
              </span>
              <div className="font-bold text-sm text-foreground">{c.name}</div>
              <div className="text-[11px] text-muted-foreground text-center leading-tight line-clamp-2">
                {c.shortTitle}
              </div>
            </motion.button>
          );
        })}
      </div>

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, type: 'spring', stiffness: 300, damping: 24 }}
        whileHover={{ scale: 1.03, y: -1 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => enterDialogue(selected)}
        className="rounded-full bg-primary text-primary-foreground font-bold px-9 py-3.5"
      >
        开始对话
      </motion.button>
    </div>
  );
}
