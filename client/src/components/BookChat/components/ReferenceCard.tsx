import { Reference } from '@/store/useChatStore';
import { BookOpen, ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const ReferenceCard = ({ references }: { references: Reference[] }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!references || references.length === 0) return null;

  return (
    <div className="mt-3">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors group"
      >
        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
          <BookOpen className="w-3 h-3" />
        </div>
        <span>已参考 {references.length} 处知识库片段</span>
        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid gap-2">
              {references.map((ref, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-sm hover:border-indigo-200 transition-colors group">
                  <div className="flex items-center gap-2 mb-2 text-indigo-700">
                    <FileText className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">{ref.book_name} · 第 {ref.chapter_num} 章</span>
                  </div>
                  <p className="text-[13px] text-slate-600 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all duration-300">
                    {ref.content}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};