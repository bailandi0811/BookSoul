import { MemoryService } from './memory.service';
import { MemoryLevel, MemoryCategory } from './interfaces/memory.types';
export declare class MemoryController {
    private readonly memoryService;
    constructor(memoryService: MemoryService);
    getProfile(userId: string, sessionId: string): Promise<import("./interfaces/memory.types").UserProfile>;
    updateProfile(userId: string, sessionId: string, body: {
        preferences?: any;
        facts?: Record<string, string>;
        summary?: string;
    }): Promise<import("./interfaces/memory.types").UserProfile>;
    getMemories(userId: string, sessionId: string, level?: MemoryLevel): Promise<import("./interfaces/memory.types").MemoryEntry[]>;
    createMemory(body: {
        userId: string;
        sessionId: string;
        content: string;
        level?: MemoryLevel;
        category?: MemoryCategory;
    }): Promise<import("./interfaces/memory.types").MemoryUpdateEvent>;
    updateMemory(memoryId: string, body: {
        userId: string;
        content?: string;
        importance?: number;
        verified?: boolean;
    }): Promise<import("./interfaces/memory.types").MemoryEntry | null>;
    deleteMemory(memoryId: string, userId: string): Promise<{
        success: boolean;
    }>;
    searchMemories(userId: string, query: string, topK?: number): Promise<import("./interfaces/memory.types").MemoryEntry[]>;
}
