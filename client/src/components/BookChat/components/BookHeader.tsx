import { useChatStore, CharacterType } from '@/store/useChatStore';
import { RotateCcw, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const CHARACTERS: { id: CharacterType; name: string; avatar: string }[] = [
  { id: 'assistant', name: '小说助手', avatar: '书' },
  { id: 'qiaofeng', name: '乔峰', avatar: '豪' },
  { id: 'duanyu', name: '段誉', avatar: '痴' },
  { id: 'wangyuyan', name: '王语嫣', avatar: '智' },
];

export const BookHeader = () => {
  const { clearMessages, currentCharacter, setCharacter } = useChatStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const current = CHARACTERS.find(c => c.id === currentCharacter) || CHARACTERS[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-20 px-8 flex items-center justify-between bg-gradient-to-r from-[#F5F2E9] to-[#FAF8F4] backdrop-blur-md border-b border-[#E6DCC8]/50 shadow-sm sticky top-0 z-10 font-serif transition-all duration-300">
      <div className="flex items-center gap-5 relative" ref={dropdownRef}>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="group flex items-center gap-4 hover:bg-white/50 p-2 rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#D4C5A9]/30"
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-[#F5F2E9] shadow-md border-2 border-[#4A3B32]/10 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3
            ${currentCharacter === 'assistant' ? 'bg-gradient-to-br from-[#2C1810] to-[#4A3B32]' : 
              currentCharacter === 'qiaofeng' ? 'bg-gradient-to-br from-[#8B4513] to-[#A0522D]' :
              currentCharacter === 'duanyu' ? 'bg-gradient-to-br from-[#5C4A42] to-[#795548]' : 'bg-gradient-to-br from-[#D4C5A9] to-[#E6DCC8] text-[#2C1810] border-[#2C1810]/10'
            }`}
          >
            <span className="font-bold text-xl font-serif">{current.avatar}</span>
          </div>
          <div className="flex flex-col justify-center h-full text-left">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-[#2C1810] text-xl tracking-wider leading-none">
                {currentCharacter === 'assistant' ? '天龙八部' : current.name}
              </h1>
              <ChevronDown className={`w-4 h-4 text-[#8B4513]/70 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            <p className="text-xs text-[#5C4A42]/70 flex items-center gap-1.5 font-medium tracking-wide uppercase mt-1">
              <span className={`w-1.5 h-1.5 rounded-full inline-block animate-pulse ${currentCharacter === 'assistant' ? 'bg-[#2C1810]' : 'bg-[#8B4513]'}`}></span>
              {currentCharacter === 'assistant' ? '沉浸式阅读伴侣' : '当前对话角色'}
            </p>
          </div>
        </button>

        {/* Character Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-56 bg-white/90 backdrop-blur-xl border border-[#E6DCC8] rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden ring-1 ring-black/5">
            {CHARACTERS.map((char) => (
              <button
                key={char.id}
                onClick={() => {
                  setCharacter(char.id);
                  setIsOpen(false);
                  clearMessages(); 
                }}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#FAF8F4] transition-all duration-200 group
                  ${currentCharacter === char.id ? 'bg-[#F5F2E9]' : ''}
                `}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm transition-transform duration-200 group-hover:scale-110
                  ${char.id === 'assistant' ? 'bg-[#2C1810] text-[#F5F2E9]' : 
                    char.id === 'qiaofeng' ? 'bg-[#8B4513] text-[#F5F2E9]' :
                    char.id === 'duanyu' ? 'bg-[#5C4A42] text-[#F5F2E9]' : 'bg-[#D4C5A9] text-[#2C1810]'
                  }`}
                >
                  {char.avatar}
                </div>
                <div className="flex flex-col">
                  <span className="text-[#2C1810] font-bold text-sm group-hover:text-[#8B4513] transition-colors">{char.name}</span>
                  <span className="text-[10px] text-[#5C4A42]/60">
                    {char.id === 'assistant' ? '全知全能' : char.id === 'qiaofeng' ? '豪迈直爽' : char.id === 'duanyu' ? '温文尔雅' : '博学多才'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button 
          onClick={clearMessages}
          className="w-10 h-10 flex items-center justify-center text-[#5C4A42] hover:text-[#2C1810] hover:bg-white hover:shadow-md rounded-full transition-all duration-300 border border-transparent hover:border-[#E6DCC8]"
          title="重新开始对话"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
