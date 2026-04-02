import { useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { MapPin, Database, Map as MapIcon, PanelLeftOpen, Mail, Sparkles, Bot, Plus, MessageSquare } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageBubble } from './components/MessageBubble';
import { InputArea } from './components/InputArea';
import { Sidebar } from './components/Sidebar';

export default function BookChat() {
  const { messages, isLoading, clearMessages, sendMessage } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);


  const SUGGESTED_QUESTIONS = [
    {
      icon: MapPin,
      gradient: 'from-emerald-500/10 to-emerald-500/5',
      border: 'border-emerald-500/20',
      iconColor: 'text-emerald-500',
      text: '我现在在哪里？离大理有多远？',
    },
    {
      icon: Database,
      gradient: 'from-violet-500/10 to-violet-500/5',
      border: 'border-violet-500/20',
      iconColor: 'text-violet-500',
      text: '乔峰在聚贤庄喝了几碗酒？',
    },
    {
      icon: MapIcon,
      gradient: 'from-amber-500/10 to-amber-500/5',
      border: 'border-amber-500/20',
      iconColor: 'text-amber-500',
      text: '无量山在现实中的什么地方？',
    },
    {
      icon: Mail,
      gradient: 'from-blue-500/10 to-blue-500/5',
      border: 'border-blue-500/20',
      iconColor: 'text-blue-500',
      text: '给我讲讲降龙十八掌，发到 user@example.com',
    },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar Navigation */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="h-full border-r border-border/50 bg-card z-30 flex-shrink-0 overflow-hidden"
          >
            <Sidebar onClose={() => setIsSidebarOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 relative h-full min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all duration-200"
                aria-label="打开侧边栏"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </motion.button>
            )}

            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl avatar-gradient flex items-center justify-center shadow-lg shadow-primary/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-semibold text-foreground tracking-tight">BookSoul</h1>
                <p className="text-[11px] text-muted-foreground/60">智能体助手</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                clearMessages();
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all duration-200"
              title="新建对话"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">新对话</span>
            </motion.button>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden relative bg-gradient-to-b from-background via-background to-background">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }} />

          <ScrollArea className="h-full chat-scrollbar" ref={scrollRef}>
            <div className="max-w-3xl mx-auto w-full py-8 min-h-[calc(100vh-150px)]">
              {/* Empty State */}
              {messages.length === 0 && !isLoading ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  className="flex flex-col items-center justify-center min-h-[60vh]"
                >
                  {/* Hero section */}
                  <div className="text-center mb-10">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, duration: 0.5 }}
                      className="w-20 h-20 mx-auto mb-6 rounded-2xl avatar-gradient flex items-center justify-center shadow-xl shadow-primary/20"
                    >
                      <MessageSquare className="w-10 h-10 text-white" />
                    </motion.div>
                    <motion.h2
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="text-2xl font-semibold text-foreground mb-3"
                    >
                      开启智能探索之旅
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-muted-foreground max-w-md mx-auto leading-relaxed"
                    >
                      基于《天龙八部》构建的智能体，不仅能回答原著问题，
                      还能感知你的位置进行古今对照
                    </motion.p>
                  </div>

                  {/* Suggested questions */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="w-full max-w-2xl px-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {SUGGESTED_QUESTIONS.map((item, i) => {
                        const Icon = item.icon;
                        return (
                          <motion.button
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + i * 0.05 }}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              // 直接发送消息而不是填充输入框
                              if (!isLoading) {
                                sendMessage(item.text);
                              }
                            }}
                            className={`
                              flex items-center gap-3 p-4 rounded-xl border bg-gradient-to-br ${item.gradient} ${item.border}
                              hover:shadow-lg transition-all duration-200 text-left group press-effect
                            `}
                          >
                            <div className={`p-2 rounded-lg bg-background/80 backdrop-blur-sm ${item.iconColor}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm text-foreground flex-1 leading-relaxed">
                              {item.text}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* Features highlight */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-12 flex items-center gap-6 text-[12px] text-muted-foreground/60"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI 智能生成</span>
                    </div>
                    <div className="w-px h-3 bg-border" />
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5" />
                      <span>向量检索</span>
                    </div>
                    <div className="w-px h-3 bg-border" />
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>古今对照</span>
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                /* Messages */
                <div className="space-y-6 pb-4">
                  <AnimatePresence initial={false}>
                    {messages.map((msg, index) => (
                      <MessageBubble
                        key={index}
                        message={msg}
                      />
                    ))}
                  </AnimatePresence>

                  {/* Loading indicator */}
                  {isLoading && messages[messages.length - 1]?.role === 'user' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="flex gap-3 items-end"
                    >
                      <div className="w-9 h-9 rounded-xl avatar-gradient flex items-center justify-center shadow-md flex-shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="bg-card border border-border/50 px-5 py-4 rounded-2xl rounded-bl-md shadow-sm">
                        <div className="flex gap-1.5 items-center h-5">
                          <div className="w-2 h-2 rounded-full bg-primary/60 typing-dot" />
                          <div className="w-2 h-2 rounded-full bg-primary/60 typing-dot" />
                          <div className="w-2 h-2 rounded-full bg-primary/60 typing-dot" />
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
        <div className="relative bg-gradient-to-t from-background via-background to-transparent">
          <InputArea />
        </div>
      </div>
    </div>
  );
}
