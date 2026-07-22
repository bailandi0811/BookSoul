import { User, Copy, Check, Quote, ChevronDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ReferenceCard } from './ReferenceCard';
import { Message, useChatStore } from '@/store/useChatStore';
import { getCharacter } from '@/data/characters';
import { motion, AnimatePresence } from 'framer-motion';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === 'user';
  const [isCopied, setIsCopied] = useState(false);
  const currentCharacter = useChatStore((s) => s.currentCharacter);
  const character = getCharacter(message.characterId ?? currentCharacter);

  const displayContent = message.content;

  const [isThinkingExpanded, setIsThinkingExpanded] = useState(message.isThinking);

  const [prevIsThinking, setPrevIsThinking] = useState(message.isThinking);
  if (message.isThinking !== prevIsThinking) {
    setPrevIsThinking(message.isThinking);
    if (message.isThinking) {
      setIsThinkingExpanded(true);
    } else if (message.thinkingSteps && message.thinkingSteps.length > 0) {
      setIsThinkingExpanded(false);
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const showStreamingCursor = message.isStreaming && displayContent.trim().length > 0;
  const sealColor = `rgb(var(${character.accentCssVar}))`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div className="flex-shrink-0 mt-1.5">
        {isUser ? (
          <div className="w-7 h-7 rounded-full bg-primary/12 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-primary/80" />
          </div>
        ) : (
          <span
            className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold"
            style={{ color: sealColor }}
          >
            {character.sealChar}
          </span>
        )}
      </div>

      <div
        className={`flex flex-col min-w-0 ${
          isUser ? 'items-end max-w-[min(100%,34rem)]' : 'items-start w-full max-w-[42rem]'
        }`}
      >
        {isUser ? (
          <div className="bg-primary/[0.12] text-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-[1.6] border border-primary/15">
            <div className="space-y-1">
              {message.content.split('\n').map((line, i) => (
                <p key={i} className={line.trim() === '' ? 'h-2' : ''}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full relative group/content rounded-2xl rounded-tl-md bg-white dark:bg-card px-5 py-4 border border-black/[0.05] dark:border-border shadow-[0_1px_3px_rgba(20,20,19,0.04),0_8px_24px_-12px_rgba(20,20,19,0.08)]">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-semibold text-primary truncate">{character.name}</span>
                <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                  {character.shortTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="复制回答"
                className="p-1.5 rounded-lg text-muted-foreground/35 hover:text-foreground hover:bg-secondary transition-all opacity-0 group-hover/content:opacity-100"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="prose-ai text-[15px] leading-[1.7] text-foreground/90">
              {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                    className="flex items-center gap-2 py-1.5 px-2.5 -ml-1 rounded-lg bg-secondary/80 border border-border/50 hover:opacity-80 transition-opacity"
                  >
                    {message.isThinking ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-[13px] font-medium text-primary">{character.thinkingLabel}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[13px] font-medium text-muted-foreground">
                          {character.thoughtDoneLabel(message.thinkingSteps.length)}
                        </span>
                      </div>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isThinkingExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <AnimatePresence>
                    {isThinkingExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 pl-4 border-l-2 border-primary/25 space-y-2.5 py-1 bg-secondary/50 rounded-r-lg">
                          {message.thinkingSteps.map((step, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-[13px] text-muted-foreground leading-relaxed"
                            >
                              {step}
                            </motion.div>
                          ))}
                          {message.isThinking && (
                            <div className="flex items-center gap-1.5 mt-2 h-4">
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                                style={{ animationDelay: '0ms' }}
                              />
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                                style={{ animationDelay: '150ms' }}
                              />
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                                style={{ animationDelay: '300ms' }}
                              />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {(!message.isThinking || displayContent.trim().length > 0) && (
                <motion.div
                  key="content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative mt-2 first:mt-0"
                >
                  {displayContent.trim().length === 0 &&
                  message.isStreaming &&
                  !message.isThinking &&
                  (!message.thinkingSteps || message.thinkingSteps.length === 0) ? (
                    <div className="flex gap-2 items-center h-6 px-1 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-[13px]">{character.waitingText}</span>
                    </div>
                  ) : (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                        strong: ({ children }) => (
                          <strong className="font-semibold text-foreground bg-primary/8 px-1 py-0.5 rounded-sm">
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
                          <blockquote className="flex gap-3 my-4 pl-0 border-l-4 border-primary/30 italic text-muted-foreground bg-muted/30 p-4 rounded-r-xl">
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
                            <code className={`${className} font-mono text-[13px]`}>{children}</code>
                          );
                        },
                        pre: ({ children }) => (
                          <pre className="bg-muted/80 rounded-xl p-4 my-4 overflow-x-auto border border-border/50">
                            {children}
                          </pre>
                        ),
                        a: ({ children, href }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {children}
                          </a>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-xl font-semibold text-foreground mt-4 mb-2">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-lg font-semibold text-foreground mt-4 mb-2">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-base font-semibold text-foreground mt-3 mb-2">{children}</h3>
                        ),
                        hr: () => <hr className="my-4 border-border/50" />,
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4">
                            <table className="w-full border-collapse border border-border/50 rounded-lg overflow-hidden">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border border-border/50 bg-muted/50 px-4 py-2 text-left font-semibold text-sm">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-border/50 px-4 py-2 text-sm">{children}</td>
                        ),
                      }}
                    >
                      {displayContent}
                    </ReactMarkdown>
                  )}

                  {showStreamingCursor && (
                    <span className="absolute w-0.5 h-5 bg-primary ml-0.5 animate-pulse rounded-sm" />
                  )}
                </motion.div>
              )}
            </div>
          </div>
        )}

        {!isUser && message.references && message.references.length > 0 && (
          <div className="mt-2.5 w-full">
            <ReferenceCard references={message.references} />
          </div>
        )}

        {!isUser && message.createdAt != null && (
          <div className="mt-1.5 text-[11px] text-muted-foreground/45 px-1">
            {new Date(message.createdAt).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};
