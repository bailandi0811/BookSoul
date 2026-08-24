import { create } from 'zustand';
import { apiFetch } from '@/lib/api';

export interface MemoryEntry {
  id: string;
  userId: string;
  sessionId: string;
  level: 'episodic' | 'semantic' | 'long_term';
  content: string;
  importance: number;
  category: 'preference' | 'fact' | 'other';
  createdAt: string;
  updatedAt: string;
  metadata: {
    editable: boolean;
    verified: boolean;
    sourceMessage?: string;
    extractReason?: string;
  };
}

export interface UserProfile {
  userId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  preferences: {
    favoriteCharacters: string[];
    interests: string[];
    location?: string;
  };
  facts: Record<string, string>;
  summary: string;
}

interface MemoryState {
  profile: UserProfile | null;
  memories: MemoryEntry[];
  isLoading: boolean;
  isExpanded: boolean;
  selectedMemory: MemoryEntry | null;
  isEditing: boolean;

  // Actions
  setExpanded: (expanded: boolean) => void;
  fetchProfile: (userId: string, sessionId: string) => Promise<void>;
  fetchMemories: (userId: string, sessionId: string) => Promise<void>;
  searchMemories: (userId: string, query: string, topK?: number) => Promise<MemoryEntry[]>;
  updateMemory: (memoryId: string, userId: string, updates: Partial<MemoryEntry>) => Promise<void>;
  deleteMemory: (memoryId: string, userId: string) => Promise<void>;
  setSelectedMemory: (memory: MemoryEntry | null) => void;
  setEditing: (editing: boolean) => void;
  handleMemoryUpdate: (data: { memoryCount: number; hasNewMemories: boolean }) => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  profile: null,
  memories: [],
  isLoading: false,
  isExpanded: false,
  selectedMemory: null,
  isEditing: false,

  setExpanded: (expanded) => set({ isExpanded: expanded }),

  fetchProfile: async (userId, sessionId) => {
    set({ isLoading: true });
    try {
      const response = await apiFetch(`/api/memory/profile/${userId}/${sessionId}`);
      if (response.ok) {
        const profile = await response.json();
        set({ profile });
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchMemories: async (userId, sessionId) => {
    set({ isLoading: true });
    try {
      const response = await apiFetch(`/api/memory/${userId}/${sessionId}`);
      if (response.ok) {
        const memories = await response.json();
        set({ memories });
      }
    } catch (error) {
      console.error('Failed to fetch memories:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  searchMemories: async (userId, query, topK = 5) => {
    try {
      const response = await apiFetch(`/api/memory/search/${userId}?q=${encodeURIComponent(query)}&topK=${topK}`);
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error('Failed to search memories:', error);
      return [];
    }
  },

  updateMemory: async (memoryId, userId, updates) => {
    try {
      const response = await apiFetch(`/api/memory/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...updates }),
      });
      if (response.ok) {
        const updated = await response.json();
        set(state => ({
          memories: state.memories.map(m => m.id === memoryId ? updated : m),
          selectedMemory: null,
          isEditing: false,
        }));
      }
    } catch (error) {
      console.error('Failed to update memory:', error);
    }
  },

  deleteMemory: async (memoryId, userId) => {
    try {
      const response = await apiFetch(`/api/memory/${memoryId}?userId=${userId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        set(state => ({
          memories: state.memories.filter(m => m.id !== memoryId),
          selectedMemory: null,
        }));
      }
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  },

  setSelectedMemory: (memory) => set({ selectedMemory: memory }),

  setEditing: (editing) => set({ isEditing: editing }),

  handleMemoryUpdate: (data) => {
    if (data.hasNewMemories) {
      // Refresh memories when new one is added
      const { profile } = get();
      if (profile) {
        get().fetchMemories(profile.userId, profile.sessionId);
      }
    }
  },
}));
