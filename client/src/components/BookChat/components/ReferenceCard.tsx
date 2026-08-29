import { Reference } from "@/store/useChatStore";
import { BookOpen, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
          transition-all duration-200 border border-border
          ${
            isExpanded
              ? "bg-secondary text-foreground"
              : "bg-secondary/80 text-muted-foreground hover:text-foreground"
          }
        `}
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span>
          引用第 {references[0]?.sectionOrder} 节「{references[0]?.sectionTitle}
          」{references.length > 1 ? `等 ${references.length} 处` : ""}
        </span>
        <div className="ml-auto">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-2">
              {references.map((ref, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-secondary/80 rounded-xl p-3.5 border border-border"
                >
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                    <FileText className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">
                      第 {ref.sectionOrder} 节 · {ref.sectionTitle}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-3">
                    {ref.excerpt}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
