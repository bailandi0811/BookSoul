import React, { useRef, useEffect } from 'react';
import { Send, User, Bot, BookOpen } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function ChatInterface() {
  const { messages, isLoading, sendMessage } = useChatStore();
  const [inputValue, setInputValue] = React.useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
        const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue);
      setInputValue('');
    }
  };

  return (
    <Card className="w-full h-[600px] flex flex-col shadow-xl border-t-4 border-t-primary">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle>BookSoul - 天龙八部</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden relative">
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          <div className="flex flex-col gap-4 pb-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 ${
                  msg.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <Avatar className="h-8 w-8 border">
                  <AvatarFallback className={msg.role === 'assistant' ? 'bg-primary/10 text-primary' : 'bg-secondary'}>
                    {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 border'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
               <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 border">
                    <AvatarFallback className="bg-primary/10 text-primary"><Bot className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <div className="bg-muted/50 border rounded-lg px-4 py-2 text-sm text-muted-foreground animate-pulse">
                    正在思考...
                  </div>
               </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter className="p-4 border-t bg-background">
        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <Input
            placeholder="输入你的问题，例如：乔峰的身世是什么？..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim()}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
