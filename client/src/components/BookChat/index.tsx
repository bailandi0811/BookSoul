import React, { useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { Send, MapPin, Database, Map as MapIcon, RotateCcw, PanelLeftOpen, Search, User, Mail } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageBubble } from './components/MessageBubble';
import { InputArea } from './components/InputArea';
import { Sidebar } from './components/Sidebar';

export default function BookChat() {
  const { messages, isLoading, clearMessages } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="h-full border-r border-slate-200 bg-white shadow-sm flex-shrink-0 z-20 overflow-hidden"
          >
            <Sidebar onClose={() => setIsSidebarOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 relative h-full min-w-0 transition-all duration-300">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="打开侧边栏"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </button>
            )}
            <div className="flex flex-col">
              <h1 className="font-semibold text-lg text-slate-800 tracking-tight">BookSoul</h1>
              <span className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">Intelligence Agent</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={clearMessages}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="新建对话"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">新对话</span>
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-hidden relative bg-slate-50/50">
          <ScrollArea className="h-full px-4 lg:px-8" ref={scrollRef}>
            <div className="max-w-3xl mx-auto w-full py-8 min-h-[calc(100vh-150px)]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mb-6">
                    <Search className="w-8 h-8 text-indigo-500" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-800 mb-3">开启智能探索</h2>
                  <p className="text-slate-500 text-center max-w-md mb-10 leading-relaxed">
                    基于《天龙八部》构建的智能体。不仅能回答原著问题，还能感知你的地理位置进行古今对照。
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                    {[
                      { icon: <MapPin className="w-4 h-4" />, text: "我现在在哪里？离大理有多远？" },
                      { icon: <Database className="w-4 h-4" />, text: "乔峰在聚贤庄喝了几碗酒？" },
                      { icon: <MapIcon className="w-4 h-4" />, text: "无量山在现实中的什么地方？" },
                      { icon: <Mail className="w-4 h-4" />, text: "给我讲讲降龙十八掌，并把内容发到我邮箱 user@example.com" }
                    ].map((item, i) => (
                      <button 
                        key={i}
                        className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all text-left text-sm text-slate-700 group"
                        onClick={() => {
                          // We need to pass this to InputArea somehow, or handle it via store.
                          // For now, let's let InputArea handle its own state or we lift it.
                          // We will use an event bus or just let the user type.
                          const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
                          if (inputEl) {
                            inputEl.value = item.text;
                            inputEl.focus();
                            // Dispatch event to trigger React state update if needed, but lifting state is better.
                          }
                        }}
                      >
                        <span className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-indigo-500 group-hover:bg-indigo-50 transition-colors">
                          {item.icon}
                        </span>
                        {item.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 pb-4">
                  <AnimatePresence initial={false}>
                    {messages.map((msg, index) => (
                      <MessageBubble 
                        key={index}
                        message={msg} 
                        isTyping={isLoading && index === messages.length - 1 && msg.role === 'assistant'}
                      />
                    ))}
                  </AnimatePresence>
                  
                  {isLoading && messages[messages.length - 1]?.role === 'user' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-4 items-end"
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm flex-shrink-0">
                        <Search className="w-4 h-4 text-white animate-pulse" />
                      </div>
                      <div className="bg-white border border-slate-200 px-5 py-3.5 rounded-2xl rounded-bl-sm shadow-sm">
                        <div className="flex gap-1.5 items-center h-5">
                          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
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
        <InputArea />
      </div>
    </div>
  );
}