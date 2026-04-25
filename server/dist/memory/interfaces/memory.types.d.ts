export declare enum MemoryLevel {
    EPISODIC = "episodic",
    SEMANTIC = "semantic",
    LONG_TERM = "long_term"
}
export declare enum MemoryCategory {
    PREFERENCE = "preference",
    FACT = "fact",
    OTHER = "other"
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
    editable: boolean;
    verified: boolean;
}
export interface MemoryEntry {
    id: string;
    userId: string;
    sessionId: string;
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
}
