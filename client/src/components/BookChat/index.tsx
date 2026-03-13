import React, { useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { Send, BookOpen, User, Sparkles, ChevronDown, ChevronUp, Quote, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';

// --- Components ---

// 1. Header Component
const BookHeader = () => {
  const clearMessages = useChatStore((state) => state.clearMessages);

  return (
    <header className="h-20 px-8 flex items-center justify-between bg-[#F5F2E9]/90 backdrop-blur-sm border-b border-[#E6DCC8] shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] sticky top-0 z-10 font-serif">
      <div className="flex items-center gap-5">
        <div className="w-11 h-11 bg-[#2C1810] rounded-xl flex items-center justify-center text-[#F5F2E9] shadow-lg border-2 border-[#4A3B32]">
          <span className="font-bold text-xl font-serif">天</span>
        </div>
        <div className="flex flex-col justify-center h-full pt-1">
          <h1 className="font-bold text-[#2C1810] text-xl tracking-wider leading-none mb-1.5">天龙八部</h1>
          <p className="text-[11px] text-[#5C4A42]/80 flex items-center gap-1.5 font-medium tracking-wide uppercase">
            <span className="w-1 h-1 bg-[#8B4513] rounded-full inline-block"></span>
            沉浸式阅读伴侣
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button 
          onClick={clearMessages}
          className="w-9 h-9 flex items-center justify-center text-[#5C4A42] hover:text-[#2C1810] hover:bg-[#E6DCC8]/40 rounded-full transition-all duration-300"
          title="重新开始对话"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

// 2. Reference Card Component
const ReferenceCard = ({ references }: { references: NonNullable<import('@/store/useChatStore').Message['references']> }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!references || references.length === 0) return null;

  return (
    <div className="mt-3 mb-1 mx-1">
      <div className="border border-[#E6DCC8] bg-[#FAF8F4] rounded-xl overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#F0EBE0] hover:bg-[#E6DCC8] transition-colors"
        >
          <div className="flex items-center gap-2 text-[#5C4A42]">
            <Quote className="w-4 h-4" />
            <span className="text-xs font-medium tracking-wide">原著引用 ({references.length})</span>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-[#5C4A42]" /> : <ChevronDown className="w-4 h-4 text-[#5C4A42]" />}
        </button>
        
        {isExpanded && (
          <div className="px-5 py-4 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar bg-[#FAF8F4]">
            {references.map((ref, idx) => (
              <div key={idx} className="text-sm text-[#4A3B32] font-serif leading-relaxed">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 bg-[#D4C5A9] text-[#2C1810] rounded-full">
                    第 {ref.chapter_num} 章
                  </span>
                  <span className="text-xs text-[#8B4513] opacity-70">{ref.book_name}</span>
                </div>
                <p className="opacity-90 pl-3 border-l-2 border-[#D4C5A9] italic text-justify">
                  {ref.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 3. Message Bubble Component
const MessageBubble = ({ message, isTyping }: { message: import('@/store/useChatStore').Message, isTyping?: boolean }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex gap-4 mb-8 group ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 mt-auto mb-1">
        {isUser ? (
          <div className="w-10 h-10 rounded-full bg-[#E6DCC8] flex items-center justify-center border border-[#D4C5A9] shadow-sm transition-transform duration-300 group-hover:scale-105">
            <User className="w-5 h-5 text-[#5C4A42]" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-2xl bg-[#2C1810] flex items-center justify-center shadow-md border border-[#4A3B32] transition-transform duration-300 group-hover:scale-105">
            <span className="font-serif text-[#F5F2E9] font-bold text-sm">书</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`
          relative px-6 py-4 rounded-2xl text-[15px] leading-7 tracking-wide font-serif shadow-sm transition-all duration-300 hover:shadow-md
          ${isUser 
            ? 'bg-[#E6DCC8] text-[#2C1810] rounded-tr-sm' 
            : 'bg-white text-[#2C1810] border border-[#E6DCC8] rounded-tl-sm'}
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
                  p: ({children}) => <p className="mb-2 last:mb-0 text-justify">{children}</p>,
                  strong: ({children}) => <span className="font-bold text-[#8B4513]">{children}</span>,
                  ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                  li: ({children}) => <li className="ml-2">{children}</li>,
                  blockquote: ({children}) => <blockquote className="border-l-2 border-[#D4C5A9] pl-3 italic text-[#5C4A42] my-2">{children}</blockquote>,
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

// 4. Main Chat Interface
export default function BookChat() {
  const { messages, isLoading, sendMessage } = useChatStore();
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Auto resize input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [inputValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue);
      setInputValue('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  const exampleQuestions = [
    "乔峰的身世之谜是什么？",
    "段誉学会了哪些绝世武功？",
    "虚竹是如何破解珍珑棋局的？",
    "慕容复的结局如何？"
  ];

  return (
    <div className="flex flex-col h-screen bg-[#F5F2E9] text-[#2C1810] font-serif selection:bg-[#D4C5A9]/40 selection:text-[#2C1810]">
      <BookHeader />

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full px-4" ref={scrollRef}>
          <div className="max-w-4xl mx-auto w-full py-8 min-h-[calc(100vh-200px)]">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
                <div className="mb-10 relative group">
                  <div className="absolute inset-0 bg-[#D4C5A9] rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-700"></div>
                  <div className="w-24 h-24 bg-[#FAF8F4] border-2 border-[#E6DCC8] rounded-full flex items-center justify-center relative shadow-[0_8px_30px_rgba(44,24,16,0.06)]">
                    <BookOpen className="w-10 h-10 text-[#8B4513] stroke-[1.5]" />
                  </div>
                </div>
                
                <h2 className="text-3xl font-serif text-[#2C1810] mb-4 tracking-[0.2em] font-bold text-center">开卷有益</h2>
                <p className="text-[#5C4A42] font-serif italic mb-12 text-center max-w-md leading-relaxed opacity-80">
                  “书中自有黄金屋，书中自有颜如玉。”<br/>
                  请问，这《天龙八部》的江湖之中，有何不解之处？
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
                  {exampleQuestions.map((q, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        setInputValue(q);
                        if (inputRef.current) inputRef.current.focus();
                      }}
                      className="group relative p-5 bg-[#FAF8F4] border border-[#E6DCC8] rounded-xl text-left transition-all duration-300 hover:border-[#D4C5A9] hover:shadow-[0_4px_20px_-4px_rgba(44,24,16,0.08)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-[#E6DCC8]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <div className="flex items-start gap-3 relative z-10">
                        <span className="text-[#D4C5A9] font-serif italic text-lg opacity-60 group-hover:text-[#8B4513] group-hover:opacity-100 transition-colors">0{i + 1}</span>
                        <span className="text-[#5C4A42] text-[15px] font-medium group-hover:text-[#2C1810] transition-colors pt-0.5 tracking-wide">{q}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                {messages.map((msg, index) => (
                  <MessageBubble 
                    key={index} 
                    message={msg} 
                    isTyping={isLoading && index === messages.length - 1 && msg.role === 'assistant'}
                  />
                ))}
                
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex gap-4">
                     <div className="w-10 h-10 rounded-2xl bg-[#2C1810] flex items-center justify-center shadow-md border border-[#4A3B32] flex-shrink-0 mt-auto mb-1">
                      <span className="font-serif text-[#F5F2E9] font-bold text-sm">书</span>
                    </div>
                    <div className="bg-white border border-[#E6DCC8] px-6 py-4 rounded-2xl rounded-tl-sm shadow-sm">
                      <div className="flex gap-2 items-center">
                        <div className="w-2 h-2 bg-[#8B4513] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-[#8B4513] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-[#8B4513] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input Area */}
      <div className="bg-[#F5F2E9] p-4 pb-8 sticky bottom-0 z-20">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative group">
            <div className="relative flex items-end bg-[#FAF8F4] rounded-[24px] border border-[#E6DCC8] shadow-[0_8px_30px_-8px_rgba(44,24,16,0.12)] focus-within:border-[#D4C5A9] focus-within:shadow-[0_12px_40px_-10px_rgba(44,24,16,0.18)] transition-all duration-300 overflow-hidden">
              <textarea
                ref={inputRef}
                placeholder="在此输入问题，与书中人物对话..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={1}
                className="w-full resize-none bg-transparent pl-6 pr-16 py-5 text-[#2C1810] placeholder:text-[#8B4513]/30 focus:outline-none min-h-[64px] max-h-[200px] text-[15px] font-serif leading-relaxed"
                style={{ height: 'auto' }}
              />
              <div className="absolute right-2 bottom-2">
                <button 
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  className={`
                    w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
                    ${inputValue.trim() 
                      ? 'bg-[#2C1810] text-[#F5F2E9] hover:bg-[#4A3B32] shadow-md transform hover:scale-105 active:scale-95' 
                      : 'bg-[#E6DCC8]/50 text-[#F5F2E9] cursor-not-allowed'}
                  `}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-[#F5F2E9]/30 border-t-[#F5F2E9] rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 ml-0.5" />
                  )}
                </button>
              </div>
            </div>
            <div className="text-center mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
              <span className="text-[10px] text-[#8B4513]/40 font-serif tracking-[0.3em] uppercase">
                — 阅 读 · 思 考 · 对 话 —
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
