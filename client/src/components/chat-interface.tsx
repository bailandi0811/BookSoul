import React, { useRef, useEffect } from 'react';
import { User, Sparkles, MoreHorizontal } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ChatInterface() {
  const { messages, isLoading, sendMessage } = useChatStore();
  const [inputValue, setInputValue] = React.useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
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

  const isEmpty = messages.length === 0 || (messages.length === 1 && messages[0].role === 'assistant');

  const exampleQuestions = [
    { icon: "👤", text: "乔峰的身世是什么？" },
    { icon: "⚔️", text: "段誉学会了哪些武功？" },
    { icon: "🏯", text: "虚竹是如何成为灵鹫宫主人的？" },
    { icon: "👑", text: "慕容复的复国计划为什么失败？" }
  ];

  return (
    <div className="flex flex-col h-full bg-[#f5f5f5] relative">
      {/* Header - 微信风格顶部栏 */}
      <header className="h-12 px-4 flex items-center justify-between bg-[#f5f5f5] border-b border-[#e7e7e7] shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-[17px] font-medium text-black">BookSoul</span>
        </div>
        <div className="flex items-center">
          <button className="p-2 hover:bg-[#ededed] rounded-md transition-colors">
            <MoreHorizontal className="h-5 w-5 text-[#1f1f1f]" />
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden relative pb-[80px]">
        <ScrollArea className="h-full px-4" ref={scrollRef}>
          <div className="max-w-3xl mx-auto w-full py-4">
            {isEmpty ? (
              // Welcome State - 微信风格空白页
              <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-4">
                <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-[#07c160]" />
                </div>
                <h2 className="text-lg text-gray-400 font-normal mb-8">开始一段新的对话</h2>
                
                {/* Example Questions - 简单的列表 */}
                <div className="w-full max-w-sm space-y-2">
                  {exampleQuestions.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputValue(item.text);
                        inputRef.current?.focus();
                      }}
                      className="w-full text-left px-4 py-3 bg-white hover:bg-[#f9f9f9] active:bg-[#f0f0f0] rounded-lg text-sm text-gray-700 transition-colors duration-200"
                    >
                      {item.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // Chat Messages - 微信风格气泡
              <div className="space-y-6">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    <div className="flex-shrink-0 mt-0.5">
                      {msg.role === 'user' ? (
                        <div className="w-10 h-10 rounded-[4px] bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden shadow-sm">
                          <User className="h-6 w-6 text-gray-500" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-[4px] bg-white flex items-center justify-center shadow-sm overflow-hidden border border-[#e5e5e5]">
                          <Sparkles className="h-6 w-6 text-[#07c160]" />
                        </div>
                      )}
                    </div>

                    {/* Message Content */}
                    <div className={`relative max-w-[75%] px-3 py-2.5 rounded-[4px] text-[15px] leading-relaxed break-words shadow-sm
                      ${msg.role === 'user' 
                        ? 'bg-[#95ec69] text-black selection:bg-[#b2f290] selection:text-black' 
                        : 'bg-white text-black border border-[#e5e5e5]'
                      }
                      /* 气泡小三角 */
                      before:content-[''] before:absolute before:top-3 before:w-0 before:h-0 before:border-[6px] before:border-transparent
                      ${msg.role === 'user' 
                        ? 'before:-right-[11px] before:border-l-[#95ec69]' 
                        : 'before:-left-[12px] before:border-r-white before:drop-shadow-[1px_0_0_#e5e5e5] md:before:drop-shadow-none' // 简单的三角处理，边框阴影比较复杂，这里简化处理
                      }
                    `}>
                      <div className={`${msg.role === 'user' ? '' : 'prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1'}`}>
                        {msg.content.split('\n').map((line, i) => (
                          <p key={i} className={line.trim() === '' ? 'h-4' : 'my-0'}>
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Loading State */}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-[4px] bg-white flex items-center justify-center shadow-sm overflow-hidden border border-[#e5e5e5] flex-shrink-0 mt-0.5">
                      <Sparkles className="h-6 w-6 text-[#07c160]" />
                    </div>
                    <div className="relative bg-white border border-[#e5e5e5] px-4 py-3 rounded-[4px] shadow-sm before:content-[''] before:absolute before:top-3 before:-left-[12px] before:w-0 before:h-0 before:border-[6px] before:border-transparent before:border-r-white">
                      <div className="flex gap-1.5 items-center h-5">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input Area - 微信风格底部栏 */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#f5f5f5] border-t border-[#e7e7e7] px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            {/* Input Wrapper */}
            <div className="flex-1 bg-white rounded-[4px] border border-[#e5e5e5] focus-within:border-[#07c160] transition-colors duration-200">
              <textarea
                ref={inputRef}
                placeholder=""
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={1}
                className="w-full resize-none bg-transparent px-3 py-2.5 text-black placeholder:text-gray-400 focus:outline-none max-h-[120px] min-h-[40px] text-[15px]"
                style={{ height: 'auto' }}
              />
            </div>
            
            {/* Send Button - 微信风格 */}
            <button 
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className={`
                h-[40px] px-6 rounded-[4px] text-sm font-medium transition-all duration-200 flex-shrink-0
                ${inputValue.trim() 
                  ? 'bg-[#07c160] text-white hover:bg-[#06ad56] shadow-sm' 
                  : 'bg-[#e0e0e0] text-[#a8a8a8] cursor-not-allowed'}
              `}
            >
              发送
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
