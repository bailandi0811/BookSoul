import { useChatStore, CharacterType } from '@/store/useChatStore';
import { Bot, User, Settings, Book, PanelLeftClose, Mail } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';

const CHARACTERS: { id: CharacterType; name: string; desc: string; icon: React.ElementType }[] = [
  { id: 'assistant', name: '全知助手', desc: '专业的《天龙八部》导读与知识库', icon: Book },
  { id: 'qiaofeng', name: '乔峰', desc: '丐帮帮主，豪迈直爽', icon: User },
  { id: 'duanyu', name: '段誉', desc: '大理世子，温文尔雅', icon: User },
  { id: 'wangyuyan', name: '王语嫣', desc: '曼陀山庄，博学多才', icon: User },
];

export const Sidebar = ({ onClose }: { onClose: () => void }) => {
  const { currentCharacter, setCharacter, clearMessages } = useChatStore();

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200">
      <div className="p-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-slate-800">Agent Hub</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors lg:hidden"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            对话角色 (Persona)
          </h3>
          <div className="space-y-1">
            {CHARACTERS.map((char) => {
              const Icon = char.icon;
              const isActive = currentCharacter === char.id;
              
              return (
                <button
                  key={char.id}
                  onClick={() => {
                    if (!isActive) {
                      setCharacter(char.id);
                      clearMessages();
                    }
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left group
                    ${isActive 
                      ? 'bg-white border border-indigo-100 shadow-sm ring-1 ring-indigo-500/10' 
                      : 'hover:bg-white hover:shadow-sm border border-transparent'}
                  `}
                >
                  <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-50 group-hover:text-slate-700'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isActive ? 'text-indigo-900' : 'text-slate-700 group-hover:text-slate-900'}`}>
                      {char.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {char.desc}
                    </div>
                  </div>
                  {isActive && (
                    <motion.div layoutId="activeIndicator" className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            挂载能力 (Capabilities)
          </h3>
          <div className="space-y-2">
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-sm font-medium text-slate-700">RAG 知识库</span>
              </div>
              <p className="text-xs text-slate-500 ml-4">Milvus 向量检索</p>
            </div>
            
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-sm font-medium text-slate-700">邮件发送 (Email)</span>
              </div>
              <p className="text-xs text-slate-500 ml-4">支持将对话内容或小说片段发送至指定邮箱</p>
            </div>
          </div>
        </div>
      </ScrollArea>
      
      <div className="p-4 border-t border-slate-200 bg-white">
         <button className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors">
           <div className="flex items-center gap-2 text-sm font-medium">
             <Settings className="w-4 h-4" />
             系统设置
           </div>
         </button>
      </div>
    </div>
  );
};
