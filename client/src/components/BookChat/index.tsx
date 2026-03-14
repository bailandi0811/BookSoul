import React, { useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { Send, BookOpen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookHeader } from './components/BookHeader';
import { MessageBubble } from './components/MessageBubble';
import { OnboardingGuide } from './components/OnboardingGuide';
import { motion, AnimatePresence } from 'framer-motion';

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
      <OnboardingGuide />

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full px-4" ref={scrollRef}>
          <div className="max-w-4xl mx-auto w-full py-8 min-h-[calc(100vh-200px)]">
            {messages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center justify-center min-h-[70vh] px-4"
              >
                <div className="mb-10 relative group">
                  <div className="absolute inset-0 bg-[#D4C5A9] rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-700"></div>
                  <motion.div 
                    whileHover={{ scale: 1.05, rotate: 2 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    className="w-24 h-24 bg-[#FAF8F4] border-2 border-[#E6DCC8] rounded-full flex items-center justify-center relative shadow-[0_8px_30px_rgba(44,24,16,0.06)]"
                  >
                    <BookOpen className="w-10 h-10 text-[#8B4513] stroke-[1.5]" />
                  </motion.div>
                </div>
                
                <h2 className="text-3xl font-serif text-[#2C1810] mb-4 tracking-[0.2em] font-bold text-center">开卷有益</h2>
                <p className="text-[#5C4A42] font-serif italic mb-12 text-center max-w-md leading-relaxed opacity-80">
                  “书中自有黄金屋，书中自有颜如玉。”<br/>
                  请问，这《天龙八部》的江湖之中，有何不解之处？
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
                  {exampleQuestions.map((q, i) => (
                    <motion.button 
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * i, type: "spring", stiffness: 200, damping: 20 }}
                      whileHover={{ scale: 1.02, backgroundColor: "#FFFFFF", borderColor: "#D4C5A9" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setInputValue(q);
                        if (inputRef.current) inputRef.current.focus();
                      }}
                      className="group relative p-5 bg-[#FAF8F4] border border-[#E6DCC8] rounded-xl text-left transition-colors duration-200 shadow-[0_4px_20px_-4px_rgba(44,24,16,0.05)] overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-[#E6DCC8]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <div className="flex items-start gap-3 relative z-10">
                        <span className="text-[#D4C5A9] font-serif italic text-lg opacity-60 group-hover:text-[#8B4513] group-hover:opacity-100 transition-colors">0{i + 1}</span>
                        <span className="text-[#5C4A42] text-[15px] font-medium group-hover:text-[#2C1810] transition-colors pt-0.5 tracking-wide">{q}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="space-y-6 pb-4">
                <AnimatePresence initial={false}>
                  {messages.map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <MessageBubble 
                        message={msg} 
                        isTyping={isLoading && index === messages.length - 1 && msg.role === 'assistant'}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4"
                  >
                     <div className="w-10 h-10 rounded-2xl bg-[#2C1810] flex items-center justify-center shadow-md border border-[#4A3B32] flex-shrink-0 mt-auto mb-1">
                      <span className="font-serif text-[#F5F2E9] font-bold text-sm">书</span>
                    </div>
                    <div className="bg-white border border-[#E6DCC8] px-6 py-4 rounded-2xl rounded-tl-sm shadow-sm">
                      <div className="flex gap-2 items-center">
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0 }}
                          className="w-2 h-2 bg-[#8B4513] rounded-full" 
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0.2 }}
                          className="w-2 h-2 bg-[#8B4513] rounded-full" 
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0.4 }}
                          className="w-2 h-2 bg-[#8B4513] rounded-full" 
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input Area */}
      <div className="bg-[#F5F2E9]/80 backdrop-blur-md p-4 pb-8 sticky bottom-0 z-20 transition-all duration-300">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative group">
            <motion.div 
              whileFocus={{ scale: 1.01 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative flex items-end bg-white/60 backdrop-blur-xl rounded-[28px] border border-[#E6DCC8] shadow-[0_8px_32px_-8px_rgba(44,24,16,0.08)] focus-within:border-[#D4C5A9] focus-within:shadow-[0_12px_48px_-10px_rgba(44,24,16,0.15)] focus-within:bg-white/80 transition-all duration-300 overflow-hidden ring-1 ring-white/20"
            >
              <textarea
                ref={inputRef}
                placeholder="在此输入问题，与书中人物对话..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={1}
                className="w-full resize-none bg-transparent pl-7 pr-16 py-5 text-[#2C1810] placeholder:text-[#8B4513]/30 focus:outline-none min-h-[64px] max-h-[200px] text-[15px] font-serif leading-relaxed"
                style={{ height: 'auto' }}
              />
              <div className="absolute right-2 bottom-2">
                <motion.button 
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className={`
                    w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300
                    ${inputValue.trim() 
                      ? 'bg-gradient-to-br from-[#2C1810] to-[#4A3B32] text-[#F5F2E9] shadow-lg shadow-[#2C1810]/20' 
                      : 'bg-[#E6DCC8]/30 text-[#8B4513]/30 cursor-not-allowed'}
                  `}
                >
                  {isLoading ? (
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-5 h-5 border-2 border-[#F5F2E9]/30 border-t-[#F5F2E9] rounded-full" 
                    />
                  ) : (
                    <Send className="w-5 h-5 ml-0.5" />
                  )}
                </motion.button>
              </div>
            </motion.div>
            <div className="text-center mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
              <span className="text-[10px] text-[#8B4513]/40 font-serif tracking-[0.3em] uppercase bg-white/30 px-3 py-1 rounded-full backdrop-blur-sm">
                — 阅 读 · 思 考 · 对 话 —
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
