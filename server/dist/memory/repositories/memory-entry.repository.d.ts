import { MemoryEntry, MemoryLevel } from '../interfaces/memory.types';
export declare class MemoryEntryRepository {
    private readonly logger;
    private readonly baseDir;
    getById(memoryId: string, userId: string): Promise<MemoryEntry | null>;
    getByUserId(userId: string, sessionId?: string): Promise<MemoryEntry[]>;
    getByLevel(userId: string, level: MemoryLevel, sessionId?: string): Promise<MemoryEntry[]>;
    save(entry: MemoryEntry): Promise<void>;
    delete(memoryId: string, userId: string): Promise<void>;
    update(memoryId: string, userId: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | null>;
    generateId(): string;
    private getFilePath;
}
