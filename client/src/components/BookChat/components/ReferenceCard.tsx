import { Reference } from '@/store/useChatStore';
import { BookOpen, ChevronDown, ChevronUp, FileText, Quote, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReferenceCardProps {
  references: Reference[];
}

export const ReferenceCard = ({ references }: ReferenceCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!references || references.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-3"
    >
      {/* Toggle button */}
      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          flex items-center gap-2.5 px-3.5 py-2 rounded-full text-xs font-medium
          transition-all duration-200
          ${isExpanded
            ? 'bg-primary/10 text-primary border border-primary/20'
            : 'bg-muted/55 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
          }
        `}
      >
        <div className={`
          p-1 rounded-lg
          ${isExpanded ? 'bg-primary/15' : 'bg-muted'}
        `}>
          <BookOpen className="w-3.5 h-3.5" />
        </div>
        <span>
          出自《{references[0]?.book_name}》第 {references[0]?.chapter_num} 回
          {references.length > 1 ? `等 ${references.length} 处` : ''}
        </span>
        <div className="ml-auto">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </motion.button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 p-1">
              {references.map((ref, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative bg-card rounded-2xl p-4 border border-border/50 hover:border-primary/20 transition-all duration-200"
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 text-primary/80">
                      <FileText className="w-3.5 h-3.5" />
                      <span className="text-xs font-semibold">
                        第 {ref.chapter_num} 回
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-border/50 to-transparent" />
                    <Sparkles className="w-3 h-3 text-primary/40" />
                  </div>

                  {/* Quote icon */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Quote className="w-4 h-4 text-primary/20" />
                  </div>

                  {/* Content */}
                  <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-3 group-hover:line-clamp-4 transition-all duration-300">
                    {ref.content}
                  </p>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
