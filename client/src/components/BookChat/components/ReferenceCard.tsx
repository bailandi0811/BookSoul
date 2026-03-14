import { useState } from 'react';
import { ChevronDown, ChevronUp, Quote } from 'lucide-react';
import { Reference } from '@/store/useChatStore';

interface ReferenceCardProps {
  references: Reference[];
}

export const ReferenceCard = ({ references }: ReferenceCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!references || references.length === 0) return null;

  return (
    <div className="mt-4 mb-2 mx-1">
      <div className="border border-[#E6DCC8]/60 bg-white/50 backdrop-blur-sm rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#F0EBE0]/50 to-transparent hover:from-[#E6DCC8]/50 transition-all duration-300"
        >
          <div className="flex items-center gap-2.5 text-[#5C4A42]">
            <div className="bg-[#D4C5A9]/20 p-1.5 rounded-lg group-hover:bg-[#D4C5A9]/40 transition-colors">
              <Quote className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold tracking-wider uppercase">原著引用 ({references.length})</span>
          </div>
          <div className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''} bg-white/50 p-1 rounded-full`}>
            <ChevronDown className="w-3.5 h-3.5 text-[#5C4A42]" />
          </div>
        </button>
        
        {isExpanded && (
          <div className="px-5 py-4 space-y-5 max-h-[300px] overflow-y-auto custom-scrollbar bg-white/30">
            {references.map((ref, idx) => (
              <div key={idx} className="text-sm text-[#4A3B32] font-serif leading-relaxed relative pl-4">
                <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-[#D4C5A9]/50 rounded-full"></div>
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 bg-[#2C1810]/5 text-[#2C1810] rounded-md font-medium shrink-0 border border-[#2C1810]/5">
                    第 {ref.chapter_num} 章
                  </span>
                  <span className="text-xs text-[#8B4513]/80 truncate max-w-[200px] font-medium" title={ref.book_name}>
                    {ref.book_name}
                  </span>
                </div>
                <div className="opacity-90 italic text-justify break-words text-[#5C4A42] leading-7 bg-[#FAF8F4]/50 p-3 rounded-lg border border-[#E6DCC8]/30">
                  "{ref.content}"
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
