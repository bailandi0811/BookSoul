import { User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ReferenceCard } from './ReferenceCard';
import { Message, useChatStore, CharacterType } from '@/store/useChatStore';

const CHARACTERS: { id: CharacterType; avatar: string }[] = [
  { id: 'assistant', avatar: '书' },
  { id: 'qiaofeng', avatar: '豪' },
  { id: 'duanyu', avatar: '痴' },
  { id: 'wangyuyan', avatar: '智' },
];

interface MessageBubbleProps {
  message: Message;
  isTyping?: boolean;
}

export const MessageBubble = ({ message, isTyping }: MessageBubbleProps) => {
  const isUser = message.role === 'user';
  const { currentCharacter } = useChatStore();
  
  const currentAvatar = !isUser 
    ? (CHARACTERS.find(c => c.id === currentCharacter)?.avatar || '书')
    : null;
  
  return (
    <div className={`flex gap-4 mb-8 group ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 mt-auto mb-1">
        {isUser ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E6DCC8] to-[#F0EBE0] flex items-center justify-center border border-[#D4C5A9]/50 shadow-sm transition-transform duration-300 group-hover:scale-105">
            <User className="w-5 h-5 text-[#5C4A42]" />
          </div>
        ) : (
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-md border border-[#4A3B32]/20 transition-all duration-300 group-hover:scale-105 group-hover:rotate-2
            ${currentCharacter === 'assistant' ? 'bg-gradient-to-br from-[#2C1810] to-[#4A3B32]' : 
              currentCharacter === 'qiaofeng' ? 'bg-gradient-to-br from-[#8B4513] to-[#A0522D]' :
              currentCharacter === 'duanyu' ? 'bg-gradient-to-br from-[#5C4A42] to-[#795548]' : 'bg-gradient-to-br from-[#D4C5A9] to-[#E6DCC8] text-[#2C1810] border-[#2C1810]/10'
            }`}
          >
            <span className="font-serif text-[#F5F2E9] font-bold text-sm drop-shadow-sm">
              {currentAvatar}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`
          relative px-6 py-4 rounded-3xl text-[15px] leading-7 tracking-wide font-serif shadow-sm transition-all duration-300 hover:shadow-md
          ${isUser 
            ? 'bg-gradient-to-br from-[#E6DCC8] to-[#F0EBE0] text-[#2C1810] rounded-tr-sm border border-[#D4C5A9]/30' 
            : 'bg-white/80 backdrop-blur-sm text-[#2C1810] border border-[#E6DCC8]/60 rounded-tl-sm'}
        `}>
          {isUser ? (
            message.content.split('\n').map((line, i) => (
              <p key={i} className={line.trim() === '' ? 'h-3' : 'mb-2 last:mb-0 text-justify'}>
                {line}
              </p>
            ))
          ) : (
            <div className="markdown-content">
              <ReactMarkdown
                components={{
                  p: ({children}) => <p className="mb-3 last:mb-0 text-justify leading-relaxed">{children}</p>,
                  strong: ({children}) => <span className="font-bold text-[#8B4513] bg-[#E6DCC8]/20 px-1 rounded">{children}</span>,
                  ul: ({children}) => <ul className="list-disc list-inside mb-3 space-y-1 marker:text-[#8B4513]">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside mb-3 space-y-1 marker:text-[#8B4513]">{children}</ol>,
                  li: ({children}) => <li className="ml-2">{children}</li>,
                  blockquote: ({children}) => <blockquote className="border-l-4 border-[#D4C5A9] pl-4 italic text-[#5C4A42] my-3 bg-[#FAF8F4] py-2 pr-2 rounded-r-lg">{children}</blockquote>,
                }}
              >
                {message.content + (isTyping ? '▍' : '')}
              </ReactMarkdown>
              {isTyping && <span className="animate-cursor-blink text-[#8B4513] ml-0.5"></span>}
            </div>
          )}
        </div>
        
        {/* References (Only for assistant) */}
        {!isUser && message.references && (
          <div className="w-full max-w-full">
            <ReferenceCard references={message.references} />
          </div>
        )}
      </div>
    </div>
  );
};
