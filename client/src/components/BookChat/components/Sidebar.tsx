import { useChatStore, CharacterType } from '@/store/useChatStore';
import { Bot, User, Settings, Book, PanelLeftClose, Mail, MapPin, Sparkles, Zap, Moon, Sun, HelpCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import { useState } from 'react';

const CHARACTERS: { id: CharacterType; name: string; desc: string; icon: React.ElementType; emoji: string }[] = [
  { id: 'assistant', name: '全知助手', desc: '专业的《天龙八部》导读与知识库', icon: Book, emoji: '📚' },
  { id: 'qiaofeng', name: '乔峰', desc: '丐帮帮主，豪迈直爽', icon: User, emoji: '💪' },
  { id: 'duanyu', name: '段誉', desc: '大理世子，温文尔雅', icon: User, emoji: '🍃' },
  { id: 'wangyuyan', name: '王语嫣', desc: '曼陀山庄，博学多才', icon: User, emoji: '🌸' },
];

const CAPABILITIES = [
  { icon: MapPin, name: '古今对照', desc: '结合地理位置与小说场景', color: 'emerald' },
  { icon: Mail, name: '邮件发送', desc: '将内容发送至指定邮箱', color: 'blue' },
  { icon: Sparkles, name: 'RAG 检索', desc: '基于向量数据库的智能问答', color: 'violet' },
];

export const Sidebar = ({ onClose }: { onClose: () => void }) => {
  const { currentCharacter, setCharacter, clearMessages } = useChatStore();
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border/50">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl avatar-gradient flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-sm">BookSoul</h2>
              <p className="text-[11px] text-muted-foreground">智能体助手</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 rounded-lg transition-all duration-200"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 py-4 scrollbar-thin">
        {/* Characters Section */}
        <div className="px-4 mb-6">
          <h3 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
            <Zap className="w-3 h-3" />
            选择角色
          </h3>
          <div className="space-y-1.5">
            {CHARACTERS.map((char, index) => {
              const isActive = currentCharacter === char.id;

              return (
                <motion.button
                  key={char.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => {
                    if (!isActive) {
                      setCharacter(char.id);
                      clearMessages();
                    }
                  }}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left press-effect
                    ${isActive
                      ? 'bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 shadow-sm'
                      : 'hover:bg-muted/50 border border-transparent'
                    }
                  `}
                >
                  {/* Emoji avatar */}
                  <div className={`
                    w-10 h-10 rounded-xl flex items-center justify-center text-xl
                    ${isActive
                      ? 'bg-gradient-to-br from-primary/20 to-primary/10'
                      : 'bg-muted/50'
                    }
                  `}>
                    {char.emoji}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {char.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                      {char.desc}
                    </div>
                  </div>

                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeCharacter"
                      className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Capabilities Section */}
        <div className="px-4 mb-6">
          <h3 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            挂载能力
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {CAPABILITIES.map((cap, index) => {
              const Icon = cap.icon;
              const colorMap: Record<string, string> = {
                emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-600',
                blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-600',
                violet: 'from-violet-500/10 to-violet-500/5 border-violet-500/20 text-violet-600',
              };

              return (
                <motion.div
                  key={cap.name}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className={`p-3 rounded-xl bg-gradient-to-br ${colorMap[cap.color]} border`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-white/50 dark:bg-black/50">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{cap.name}</div>
                      <div className="text-[11px] text-muted-foreground/80">{cap.desc}</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3 px-1">
            快捷指令
          </h3>
          <div className="space-y-1.5">
            {[
              { icon: MapPin, text: '我在哪里？', color: 'emerald' },
              { icon: Book, text: '乔峰是谁？', color: 'violet' },
              { icon: Mail, text: '发邮件测试', color: 'blue' },
            ].map((item, i) => {
              const Icon = item.icon;
              const colorMap: Record<string, string> = {
                emerald: 'text-emerald-500 bg-emerald-500/10',
                blue: 'text-blue-500 bg-blue-500/10',
                violet: 'text-violet-500 bg-violet-500/10',
              };
              return (
                <button
                  key={i}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-muted/50 transition-all duration-200 text-left group"
                  onClick={() => {
                    const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
                    if (inputEl) {
                      inputEl.value = item.text;
                      inputEl.focus();
                    }
                  }}
                >
                  <div className={`p-1.5 rounded-lg ${colorMap[item.color]}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {item.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-border/50 space-y-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 rounded-xl transition-all duration-200 group"
        >
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground group-hover:text-foreground">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{isDark ? '浅色模式' : '深色模式'}</span>
          </div>
          <div className={`
            w-9 h-5 rounded-full p-0.5 transition-colors duration-200
            ${isDark ? 'bg-primary' : 'bg-muted'}
          `}>
            <motion.div
              animate={{ x: isDark ? 16 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-4 h-4 rounded-full bg-white shadow-sm"
            />
          </div>
        </button>

        {/* Settings */}
        <button className="w-full flex items-center gap-2.5 p-2.5 hover:bg-muted/50 rounded-xl transition-all duration-200 text-muted-foreground hover:text-foreground">
          <Settings className="w-4 h-4" />
          <span className="text-sm">系统设置</span>
        </button>

        {/* Help */}
        <button className="w-full flex items-center gap-2.5 p-2.5 hover:bg-muted/50 rounded-xl transition-all duration-200 text-muted-foreground hover:text-foreground">
          <HelpCircle className="w-4 h-4" />
          <span className="text-sm">使用帮助</span>
        </button>
      </div>
    </div>
  );
};
