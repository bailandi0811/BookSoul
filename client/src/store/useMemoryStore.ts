import { create } from 'zustand';
import { apiFetch } from '@/lib/api';
import { readApiError } from '@/lib/api';

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
  error: string | null;
  pendingRequests: number;

  // Actions
  setExpanded: (expanded: boolean) => void;
  fetchProfile: (userId: string, sessionId: string) => Promise<void>;
  fetchMemories: (userId: string, sessionId: string) => Promise<void>;
  searchMemories: (userId: string, query: string, topK?: number) => Promise<MemoryEntry[]>;
  createMemory: (sessionId: string, content: string, category?: MemoryEntry['category']) => Promise<void>;
  updateMemory: (memoryId: string, updates: { content?: string; importance?: number; verified?: boolean }) => Promise<void>;
  deleteMemory: (memoryId: string) => Promise<void>;
  setSelectedMemory: (memory: MemoryEntry | null) => void;
  setEditing: (editing: boolean) => void;
  handleMemoryUpdate: (data: { memoryCount: number; hasNewMemories: boolean }) => void;
}

let latestProfileRequest = 0;
let latestMemoryRequest = 0;

export const useMemoryStore = create<MemoryState>((set, get) => ({
  profile: null,
  memories: [],
  isLoading: false,
  isExpanded: false,
  selectedMemory: null,
  isEditing: false,
  error: null,
  pendingRequests: 0,

  setExpanded: (expanded) => set({ isExpanded: expanded }),

  fetchProfile: async (userId, sessionId) => {
    const requestId = ++latestProfileRequest;
    set((state) => ({
      profile: null,
      error: null,
      pendingRequests: state.pendingRequests + 1,
      isLoading: true,
    }));
    try {
      const response = await apiFetch(`/api/memory/profile/${userId}/${sessionId}`);
      if (response.ok) {
        const profile = await response.json();
        if (requestId === latestProfileRequest) set({ profile });
      } else throw new Error(await readApiError(response));
    } catch (error) {
      if (requestId === latestProfileRequest) {
        set({ error: error instanceof Error ? error.message : '画像加载失败' });
      }
    } finally {
      set((state) => {
        const pendingRequests = Math.max(0, state.pendingRequests - 1);
        return { pendingRequests, isLoading: pendingRequests > 0 };
      });
    }
  },

  fetchMemories: async (userId, sessionId) => {
    const requestId = ++latestMemoryRequest;
    set((state) => ({
      memories: [],
      error: null,
      pendingRequests: state.pendingRequests + 1,
      isLoading: true,
    }));
    try {
      const response = await apiFetch(`/api/memory/${userId}/${sessionId}`);
      if (response.ok) {
        const memories = await response.json();
        if (requestId === latestMemoryRequest) set({ memories });
      } else throw new Error(await readApiError(response));
    } catch (error) {
      if (requestId === latestMemoryRequest) {
        set({ error: error instanceof Error ? error.message : '记忆加载失败' });
      }
    } finally {
      set((state) => {
        const pendingRequests = Math.max(0, state.pendingRequests - 1);
        return { pendingRequests, isLoading: pendingRequests > 0 };
      });
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

  createMemory: async (sessionId, content, category) => {
    set({ error: null });
    const response = await apiFetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, content, category }),
    });
    if (!response.ok) {
      const message = await readApiError(response);
      set({ error: message });
      throw new Error(message);
    }
    const created = (await response.json()) as MemoryEntry;
    set((state) => ({ memories: [created, ...state.memories] }));
  },

  updateMemory: async (memoryId, updates) => {
    try {
      const response = await apiFetch(`/api/memory/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        const updated = await response.json();
        set(state => ({
          memories: state.memories.map(m => m.id === memoryId ? updated : m),
          selectedMemory: null,
          isEditing: false,
        }));
      } else throw new Error(await readApiError(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : '记忆更新失败';
      set({ error: message });
      throw error;
    }
  },

  deleteMemory: async (memoryId) => {
    try {
      const response = await apiFetch(`/api/memory/${memoryId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        set(state => ({
          memories: state.memories.filter(m => m.id !== memoryId),
          selectedMemory: null,
        }));
      } else throw new Error(await readApiError(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : '记忆删除失败';
      set({ error: message });
      throw error;
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
