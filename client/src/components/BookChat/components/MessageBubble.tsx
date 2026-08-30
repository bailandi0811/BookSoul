import {
  BookOpen,
  User,
  Copy,
  Check,
  Quote,
  ChevronDown,
  Loader2,
  Mail,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ReferenceCard } from "./ReferenceCard";
import { type Message } from "@/store/useChatStore";
import { useBooksStore } from "@/store/useBooksStore";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { createEmailDraft } from "@/lib/email-draft";
import { EmailComposerDialog } from "./EmailComposerDialog";
import { ExternalReferenceCard } from "./ExternalReferenceCard";

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const [isCopied, setIsCopied] = useState(false);
  const [isEmailComposerOpen, setIsEmailComposerOpen] = useState(false);
  const assistantName = useBooksStore(
    (state) => state.assistant?.name ?? "阅读助手",
  );
  const bookTitle = useBooksStore(
    (state) => state.currentBook?.title ?? "当前书籍",
  );
  const accountEmail = useAuthStore((state) => state.user?.email ?? "");
  const emailDraft = createEmailDraft({
    recipient: accountEmail,
    bookTitle,
    assistantName,
    content: message.content,
    references: message.references,
  });

  const displayContent = message.content;

  const [isThinkingExpanded, setIsThinkingExpanded] = useState(
    message.isThinking,
  );

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

  const showStreamingCursor =
    message.isStreaming && displayContent.trim().length > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={`group flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div className="mt-1.5 flex-shrink-0">
        {isUser ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-primary/12">
            <User className="h-3.5 w-3.5 text-primary/80" />
          </div>
        ) : (
          <span className="warm-tint flex h-8 w-8 items-center justify-center rounded-[12px] text-primary">
            <BookOpen className="h-4 w-4" />
          </span>
        )}
      </div>

      <div
        className={`flex min-w-0 flex-col ${
          isUser
            ? "max-w-[min(100%,38rem)] items-end"
            : "w-full max-w-[50rem] items-start"
        }`}
      >
        {isUser ? (
          <div className="rounded-[20px] rounded-br-md border border-primary/15 bg-primary/[0.12] px-4 py-2.5 text-[15px] leading-[1.65] text-foreground">
            <div className="space-y-1">
              {message.content.split("\n").map((line, i) => (
                <p key={i} className={line.trim() === "" ? "h-2" : ""}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="warm-card-raised group/content relative w-full rounded-[24px] rounded-tl-md px-5 py-4 sm:px-6 sm:py-5">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-primary">
                  {assistantName}
                </span>
                <span className="hidden truncate rounded-full bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline">
                  阅读笔记
                </span>
              </div>
              <div className="flex items-center gap-1">
                {!message.isStreaming && displayContent.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsEmailComposerOpen(true)}
                    aria-label="发送到邮箱"
                    title="发送到邮箱"
                    className="rounded-lg p-1.5 text-muted-foreground/55 opacity-70 transition-[color,background-color,opacity] hover:bg-secondary hover:text-foreground group-hover/content:opacity-100"
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="复制回答"
                  className="rounded-lg p-1.5 text-muted-foreground/55 opacity-70 transition-[color,background-color,opacity] hover:bg-secondary hover:text-foreground group-hover/content:opacity-100"
                >
                  {isCopied ? (
                    <Check className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="prose-ai text-[15px] leading-[1.8] text-foreground/90">
              {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                    className="warm-inset -ml-1 flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-opacity hover:opacity-80"
                  >
                    {message.isThinking ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-[13px] font-medium text-primary">
                          正在检索已读内容
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[13px] font-medium text-muted-foreground">
                          已完成检索
                        </span>
                      </div>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isThinkingExpanded ? "rotate-180" : ""}`}
                    />
                  </button>

                  <AnimatePresence>
                    {isThinkingExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 space-y-2.5 rounded-r-xl border-l-2 border-primary/25 bg-secondary/50 py-2 pl-4">
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
                                style={{ animationDelay: "0ms" }}
                              />
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                                style={{ animationDelay: "150ms" }}
                              />
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                                style={{ animationDelay: "300ms" }}
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
                  (!message.thinkingSteps ||
                    message.thinkingSteps.length === 0) ? (
                    <div className="flex gap-2 items-center h-6 px-1 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-[13px]">正在组织回答</span>
                    </div>
                  ) : (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-3 last:mb-0">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-foreground bg-primary/8 px-1 py-0.5 rounded-sm">
                            {children}
                          </strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside my-3 space-y-1 marker:text-primary/60">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside my-3 space-y-1 marker:text-primary/60">
                            {children}
                          </ol>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="font-reading my-4 flex gap-3 rounded-r-xl border-l-4 border-primary/30 bg-muted/30 p-4 pl-0 italic text-muted-foreground">
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
                            <code
                              className={`${className} font-mono text-[13px]`}
                            >
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
                          <h1 className="text-xl font-semibold text-foreground mt-4 mb-2">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-lg font-semibold text-foreground mt-4 mb-2">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-base font-semibold text-foreground mt-3 mb-2">
                            {children}
                          </h3>
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
                          <td className="border border-border/50 px-4 py-2 text-sm">
                            {children}
                          </td>
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

            {message.references && message.references.length > 0 && (
              <div className="mt-4 border-t border-border/65 pt-4">
                <ReferenceCard references={message.references} />
              </div>
            )}
            {message.externalReferences &&
              message.externalReferences.length > 0 && (
                <div className="mt-3 border-t border-border/65 pt-4">
                  <ExternalReferenceCard
                    references={message.externalReferences}
                  />
                </div>
              )}
          </div>
        )}

        {!isUser && message.createdAt != null && (
          <div className="mt-1.5 text-[11px] text-muted-foreground/45 px-1">
            {new Date(message.createdAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
      {!isUser && isEmailComposerOpen && (
        <EmailComposerDialog
          draft={emailDraft}
          onClose={() => setIsEmailComposerOpen(false)}
        />
      )}
    </motion.div>
  );
};
