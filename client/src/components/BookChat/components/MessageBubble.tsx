import { User, Copy, Check, Bot, Quote, Sparkles } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ReferenceCard } from './ReferenceCard';
import { Message } from '@/store/useChatStore';
import { motion, AnimatePresence } from 'framer-motion';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === 'user';
  const [isCopied, setIsCopied] = useState(false);
  const [displayContent, setDisplayContent] = useState(message.content);
  const contentRef = useRef(message.content);

  // 当message.content变化时，更新displayContent
  useEffect(() => {
    if (message.isStreaming) {
      // 流式输出时立即更新显示内容
      setDisplayContent(message.content);
      contentRef.current = message.content;
    } else if (message.content !== contentRef.current) {
      // 非流式输出时直接更新
      setDisplayContent(message.content);
      contentRef.current = message.content;
    }
  }, [message.content, message.isStreaming]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const showStreamingCursor = message.isStreaming && displayContent.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-0.5">
        {isUser ? (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-sm">
            <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl avatar-gradient flex items-center justify-center shadow-md ring-2 ring-white dark:ring-slate-800">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col w-full max-w-[85%] lg:max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Message bubble */}
        <div className={`
          relative px-5 py-4 rounded-2xl text-[15px] leading-relaxed transition-all duration-200
          ${isUser
            ? 'bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-tr-md shadow-lg shadow-slate-900/10 dark:from-slate-800 dark:to-slate-900'
            : 'bg-card text-card-foreground border border-border/50 rounded-tl-md shadow-sm hover:shadow-md'
          }
        `}>
          {isUser ? (
            // User message - simple text
            <div className="space-y-1">
              {message.content.split('\n').map((line, i) => (
                <p key={i} className={line.trim() === '' ? 'h-2' : ''}>
                  {line}
                </p>
              ))}
            </div>
          ) : (
            // Assistant message - markdown with streaming support
            <div className="relative group/content">
              {/* Action buttons - appear on hover */}
              <div className={`
                absolute -right-2 -top-2 flex items-center gap-1 opacity-0 group-hover/content:opacity-100
                transition-all duration-200 ${isUser ? '-left-16 right-auto' : ''}
              `}>
                <button
                  onClick={handleCopy}
                  aria-label="复制回答"
                  className="p-1.5 bg-background/80 backdrop-blur-sm rounded-lg shadow-sm border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Markdown content with streaming cursor */}
              <div className="prose-ai">
                <AnimatePresence mode="wait">
                  {message.isThinking ? (
                    <motion.div
                      key="thinking"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-3 text-muted-foreground/80 bg-muted/30 px-4 py-3 rounded-xl border border-border/40"
                    >
                      <Sparkles className="w-4 h-4 animate-pulse text-primary/70" />
                      <span className="text-sm font-medium tracking-wide">
                        思考中，正在检索与决策...
                      </span>
                      <div className="flex gap-1 items-center h-5 pt-0.5 ml-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                          strong: ({ children }) => (
                            <strong className="font-semibold text-foreground bg-gradient-to-r from-primary/10 to-primary/5 px-1 py-0.5 rounded">
                              {children}
                            </strong>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc list-inside my-3 space-y-1 marker:text-primary/60">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal list-inside my-3 space-y-1 marker:text-primary/60">{children}</ol>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="flex gap-3 my-4 pl-0 border-l-4 border-primary/30 italic text-muted-foreground bg-gradient-to-r from-muted/30 to-transparent p-4 rounded-r-xl">
                              <Quote className="w-5 h-5 text-primary/40 flex-shrink-0 rotate-180 mt-0.5" />
                              <div className="flex-1">{children}</div>
                            </blockquote>
                          ),
                          code: ({ children, className }) => {
                            const isInline = !className;
                            if (isInline) {
                              return (
                                <code className="font-mono text-[13px] bg-muted/50 px-1.5 py-0.5 rounded text-foreground">
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <code className={`${className} block font-mono text-[13px] bg-muted/80 rounded-xl p-4 my-4 overflow-x-auto border border-border/50`}>
                                {children}
                              </code>
                            );
                          },
                          pre: ({ children }) => (
                            <pre className="bg-muted/80 rounded-xl p-4 my-4 overflow-x-auto border border-border/50">
                              {children}
                            </pre>
                          ),
                          a: ({ children, href }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {children}
                            </a>
                          ),
                          h1: ({ children }) => <h1 className="text-xl font-semibold text-foreground mt-4 mb-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-lg font-semibold text-foreground mt-4 mb-2">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-base font-semibold text-foreground mt-3 mb-2">{children}</h3>,
                          hr: () => <hr className="my-4 border-border/50" />,
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-4">
                              <table className="w-full border-collapse border border-border/50 rounded-lg overflow-hidden">
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="border border-border/50 bg-muted/50 px-4 py-2 text-left font-semibold text-sm">{children}</th>
                          ),
                          td: ({ children }) => (
                            <td className="border border-border/50 px-4 py-2 text-sm">{children}</td>
                          ),
                        }}
                      >
                        {displayContent}
                      </ReactMarkdown>

                      {/* Streaming cursor */}
                      {showStreamingCursor && (
                        <span className="absolute w-0.5 h-5 bg-primary ml-0.5 animate-pulse rounded-sm" />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* References */}
        {!isUser && message.references && message.references.length > 0 && (
          <div className="mt-2">
            <ReferenceCard references={message.references} />
          </div>
        )}

        {/* Timestamp - show on hover */}
        {!isUser && (
          <div className="mt-1 text-[11px] text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors duration-200 px-1">
            {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </motion.div>
  );
};
