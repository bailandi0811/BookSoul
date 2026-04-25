import { UserProfile } from '../interfaces/memory.types';
export declare class UserProfileRepository {
    private readonly logger;
    private readonly baseDir;
    get(userId: string, sessionId: string): Promise<UserProfile | null>;
    save(profile: UserProfile): Promise<void>;
    update(userId: string, sessionId: string, updates: Partial<UserProfile>): Promise<UserProfile>;
    delete(userId: string, sessionId: string): Promise<void>;
    createDefault(userId: string, sessionId: string): UserProfile;
    private getFilePath;
}
