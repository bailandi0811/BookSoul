import { User, Copy, Check, Bot, Quote } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ReferenceCard } from './ReferenceCard';
import { Message } from '@/store/useChatStore';

interface MessageBubbleProps {
  message: Message;
  isTyping?: boolean;
}

export const MessageBubble = ({ message, isTyping }: MessageBubbleProps) => {
  const isUser = message.role === 'user';
  const [isCopied, setIsCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  return (
    <div className={`flex gap-4 group ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300">
            <User className="w-4 h-4 text-slate-600" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col w-full max-w-[85%] lg:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`
          relative px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm transition-shadow hover:shadow-md text-left
          ${isUser 
            ? 'bg-slate-900 text-white rounded-tr-sm' 
            : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'}
        `}>
          {isUser ? (
            message.content.split('\n').map((line, i) => (
              <p key={i} className={line.trim() === '' ? 'h-3' : 'mb-1 last:mb-0'}>
                {line}
              </p>
            ))
          ) : (
            <div className="markdown-content prose prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 prose-pre:text-slate-800 prose-pre:border prose-pre:border-slate-200 relative group/content">
              {!isTyping && (
                <button 
                  onClick={handleCopy}
                  aria-label="复制回答"
                  className="absolute -right-2 -top-2 opacity-0 group-hover/content:opacity-100 transition-opacity p-1.5 bg-white rounded-md shadow-sm border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 z-10"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
              <ReactMarkdown
                components={{
                  p: ({children}) => <p className="mb-3 last:mb-0">{children}</p>,
                  strong: ({children}) => <span className="font-semibold text-slate-900 bg-indigo-50 px-1 rounded-sm">{children}</span>,
                  ul: ({children}) => <ul className="list-disc list-inside mb-3 space-y-1 marker:text-slate-400">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside mb-3 space-y-1 marker:text-slate-400">{children}</ol>,
                  blockquote: ({children}) => (
                    <blockquote className="flex gap-3 my-4 pl-0 border-none italic text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <Quote className="w-5 h-5 text-indigo-300 flex-shrink-0 rotate-180" />
                      <div>{children}</div>
                    </blockquote>
                  ),
                }}
              >
                {message.content + (isTyping ? '▍' : '')}
              </ReactMarkdown>
              {isTyping && <span className="animate-pulse text-indigo-500 ml-0.5">_</span>}
            </div>
          )}
        </div>
        
        {/* References */}
        {!isUser && message.references && message.references.length > 0 && (
          <div className="w-full mt-2">
            <ReferenceCard references={message.references} />
          </div>
        )}
      </div>
    </div>
  );
};