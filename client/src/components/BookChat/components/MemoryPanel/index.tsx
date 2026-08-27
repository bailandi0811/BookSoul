import { useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMemoryStore, MemoryEntry } from '@/store/useMemoryStore';
import { Brain, ChevronDown, Heart, Info, Bookmark, Plus, Sparkles, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export const MemoryPanel = () => {
  const { sessionId } = useChatStore();
  const {
    profile,
    memories,
    isLoading,
    isExpanded,
    setExpanded,
    fetchProfile,
    fetchMemories,
    setSelectedMemory,
    deleteMemory,
    createMemory,
    updateMemory,
    selectedMemory,
    error,
  } = useMemoryStore();
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MemoryEntry | null>(null);

  const userId = useAuthStore(
    (state) => state.user?.id ?? state.guestUserId,
  );

  useEffect(() => {
    if (sessionId) {
      fetchProfile(userId, sessionId);
      fetchMemories(userId, sessionId);
    }
  }, [sessionId, userId, fetchProfile, fetchMemories]);

  const groupedMemories = {
    preference: memories.filter(m => m.category === 'preference'),
    fact: memories.filter(m => m.category === 'fact'),
    other: memories.filter(m => m.category === 'other'),
  };

  const totalMemories = memories.length;
  const hasContent = totalMemories > 0 || profile?.summary;

  const beginEdit = (memory: MemoryEntry) => {
    setSelectedMemory(memory);
    setIsAdding(false);
    setDraft(memory.content);
  };

  const closeEditor = () => {
    setSelectedMemory(null);
    setIsAdding(false);
    setDraft('');
  };

  const saveDraft = async () => {
    const content = draft.trim();
    if (!content || isSaving) return;
    setIsSaving(true);
    try {
      if (selectedMemory) {
        await updateMemory(selectedMemory.id, { content });
      } else {
        await createMemory(sessionId, content);
      }
      closeEditor();
    } catch {
      // Store action exposes the user-facing error in panel state.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border-t border-border/50 bg-gradient-to-b from-card/50 to-card">
      {/* Header - Clickable to expand/collapse */}
      <button
        onClick={() => setExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-all duration-200 group"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-xl transition-all duration-300",
            isExpanded ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground"
          )}>
            <Brain className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">记忆</div>
            <div className="text-[11px] text-muted-foreground/60">
              {hasContent ? `${totalMemories} 条记忆` : '对话后自动记下'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {isExpanded ? (
              <motion.div
                key="expanded"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="flex items-center gap-1.5"
              >
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {totalMemories}
                </span>
              </motion.div>
            ) : totalMemories > 0 ? (
              <motion.div
                key="collapsed"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="flex items-center gap-1.5"
              >
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {totalMemories}
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <ChevronDown className={cn(
            "w-4 h-4 text-muted-foreground transition-all duration-300",
            isExpanded ? "rotate-180" : ""
          )} />
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 max-h-96 overflow-y-auto scrollbar-thin">
              {/* User Profile Summary Card */}
              {profile?.summary && (
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/5 via-primary/5 to-violet-500/5 border border-amber-500/20 p-3.5"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full" />
                  <div className="relative">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="p-1 rounded-md bg-amber-500/10">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                      </div>
                      <span className="text-[11px] font-medium text-amber-600/80 uppercase tracking-wider">用户画像</span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{profile.summary}</p>
                  </div>
                </motion.div>
              )}

              {/* Memory Categories */}
              <div className="space-y-4">
                {/* Preferences */}
                <MemoryCategory
                  icon={Heart}
                  label="偏好"
                  color="rose"
                  memories={groupedMemories.preference}
                  onEdit={beginEdit}
                  onDelete={(memory) => setPendingDelete(memory)}
                  delay={0.15}
                />

                {/* Facts */}
                <MemoryCategory
                  icon={Info}
                  label="事实"
                  color="blue"
                  memories={groupedMemories.fact}
                  onEdit={beginEdit}
                  onDelete={(memory) => setPendingDelete(memory)}
                  delay={0.2}
                />

                {/* Other */}
                <MemoryCategory
                  icon={Bookmark}
                  label="其他"
                  color="amber"
                  memories={groupedMemories.other}
                  onEdit={beginEdit}
                  onDelete={(memory) => setPendingDelete(memory)}
                  delay={0.25}
                />
              </div>

              {/* Empty State */}
              {totalMemories === 0 && !isLoading && !profile?.summary && (
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-center py-8 px-4"
                >
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                    <Archive className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground/60 mb-1">暂无记忆</p>
                  <p className="text-[11px] text-muted-foreground/40">开始对话后，AI 会自动学习你的偏好和关键信息</p>
                </motion.div>
              )}

              {error && (
                <p role="alert" className="text-xs text-destructive px-1">
                  {error}
                </p>
              )}

              {(isAdding || selectedMemory) && (
                <div className="rounded-xl border border-primary/20 bg-card p-3 space-y-3">
                  <label htmlFor="memory-editor" className="text-xs font-medium text-foreground">
                    {selectedMemory ? '编辑记忆' : '添加一条确定的记忆'}
                  </label>
                  <textarea
                    id="memory-editor"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    autoFocus
                    className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="例如：我更喜欢从人物动机分析情节"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={closeEditor} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={!draft.trim() || isSaving}
                      onClick={() => void saveDraft()}
                      className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-40"
                    >
                      {isSaving ? '保存中' : '保存'}
                    </button>
                  </div>
                </div>
              )}

              {/* Add Memory Button */}
              <motion.button
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.35 }}
                type="button"
                onClick={() => {
                  setSelectedMemory(null);
                  setIsAdding(true);
                  setDraft('');
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group"
              >
                <Plus className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                <span className="text-sm text-muted-foreground/60 group-hover:text-foreground/80 transition-colors">添加记忆</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除这条记忆？"
        description="删除后无法在当前设备上恢复。"
        confirmLabel="删除"
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          void deleteMemory(pendingDelete.id).catch(() => undefined);
          setPendingDelete(null);
        }}
      />
    </div>
  );
};

// Memory Category Section Component
interface MemoryCategoryProps {
  icon: React.ElementType;
  label: string;
  color: 'rose' | 'blue' | 'amber';
  memories: MemoryEntry[];
  onEdit: (memory: MemoryEntry) => void;
  onDelete: (memory: MemoryEntry) => void;
  delay: number;
}

const MemoryCategory = ({ icon: Icon, label, color, memories, onEdit, onDelete, delay }: MemoryCategoryProps) => {
  if (memories.length === 0) return null;

  const colorMap = {
    rose: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-600',
      border: 'border-rose-500/20',
      icon: 'text-rose-500',
    },
    blue: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-600',
      border: 'border-blue-500/20',
      icon: 'text-blue-500',
    },
    amber: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-600',
      border: 'border-amber-500/20',
      icon: 'text-amber-500',
    },
  };

  const colors = colorMap[color];

  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay }}
      className="space-y-2"
    >
      <div className={cn("flex items-center gap-1.5 px-1", colors.text)}>
        <div className={cn("p-1 rounded-md", colors.bg)}>
          <Icon className={cn("w-3 h-3", colors.icon)} />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-muted-foreground/40">({memories.length})</span>
      </div>

      <div className="space-y-1.5">
        {memories.map((memory, index) => (
          <MemoryItem
            key={memory.id}
            memory={memory}
            color={color}
            onEdit={() => onEdit(memory)}
            onDelete={() => onDelete(memory)}
            delay={delay + index * 0.05}
          />
        ))}
      </div>
    </motion.div>
  );
};

// Individual Memory Item Component
interface MemoryItemProps {
  memory: MemoryEntry;
  color: 'rose' | 'blue' | 'amber';
  onEdit: () => void;
  onDelete: () => void;
  delay: number;
}

const MemoryItem = ({ memory, color, onEdit, onDelete, delay }: MemoryItemProps) => {
  const colorMap = {
    rose: { border: 'border-rose-500/10', hover: 'hover:border-rose-500/30', accent: 'bg-rose-500' },
    blue: { border: 'border-blue-500/10', hover: 'hover:border-blue-500/30', accent: 'bg-blue-500' },
    amber: { border: 'border-amber-500/10', hover: 'hover:border-amber-500/30', accent: 'bg-amber-500' },
  };

  const colors = colorMap[color];

  const levelLabel = {
    long_term: { text: '长期', bg: 'bg-purple-100 text-purple-600' },
    semantic: { text: '语义', bg: 'bg-blue-100 text-blue-600' },
    episodic: { text: '短期', bg: 'bg-gray-100 text-gray-500' },
  };

  const level = levelLabel[memory.level];

  return (
    <motion.div
      initial={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay }}
      className={cn(
        "group relative rounded-lg border bg-card p-3 transition-all duration-200",
        colors.border,
        colors.hover,
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Importance indicator bar */}
        <div className={cn("w-0.5 h-full min-h-[40px] rounded-full", colors.accent)} style={{
          opacity: Math.max(0.3, memory.importance)
        }} />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2">{memory.content}</p>

          <div className="flex items-center gap-2 mt-2">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", level.bg)}>
              {level.text}
            </span>
            <span className="text-[10px] text-muted-foreground/40">
              {new Date(memory.createdAt).toLocaleDateString()}
            </span>
            {memory.metadata.extractReason && (
              <span className="text-[10px] text-muted-foreground/30 truncate">
                · {memory.metadata.extractReason}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons - show on hover */}
        <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-all duration-200 flex items-center gap-1 -mt-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="编辑"
            aria-label="编辑记忆"
          >
            <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-rose-500/10 transition-colors"
            title="删除"
            aria-label="删除记忆"
          >
            <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
