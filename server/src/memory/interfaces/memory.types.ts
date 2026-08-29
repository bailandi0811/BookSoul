export enum MemoryLevel {
  EPISODIC = 'episodic', // 情景记忆（短期，对话窗口内）
  SEMANTIC = 'semantic', // 语义记忆（用户画像）
  LONG_TERM = 'long_term', // 长期记忆（高重要性）
}

export enum MemoryCategory {
  PREFERENCE = 'preference', // 偏好
  FACT = 'fact', // 事实
  OTHER = 'other', // 其他
}

export interface UserPreferences {
  favoriteCharacters: string[];
  interests: string[];
  location?: string;
}

export interface UserProfile {
  userId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  preferences: UserPreferences;
  facts: Record<string, string>;
  summary: string;
}

export interface MemoryMetadata {
  sourceMessage?: string;
  extractReason?: string;
  tags?: string[];
  source?: 'automatic' | 'manual';
  occurrences?: number;
  lastSeenAt?: string;
  sourceSessionIds?: string[];
  editable: boolean;
  verified: boolean;
}

export interface MemoryEntry {
  id: string;
  userId: string;
  sessionId: string;
  bookId?: string | null;
  level: MemoryLevel;
  content: string;
  importance: number;
  category: MemoryCategory;
  createdAt: string;
  updatedAt: string;
  vector?: number[];
  metadata: MemoryMetadata;
}

export interface ImportanceScore {
  score: number;
  reasons: string[];
  suggestedLevel: MemoryLevel;
  extractContent?: string;
}

export interface MemoryUpdateEvent {
  hasNewMemories: boolean;
  memoryCount: number;
  proposedCount?: number;
  confirmedCount?: number;
  updatedCount?: number;
}
