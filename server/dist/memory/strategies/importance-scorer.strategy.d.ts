import { ImportanceScore } from '../interfaces/memory.types';
export declare class ImportanceScorerStrategy {
    private readonly logger;
    private readonly HIGH_IMPORTANCE_PATTERNS;
    private readonly MEDIUM_IMPORTANCE_PATTERNS;
    score(message: string, context?: string[]): Promise<ImportanceScore>;
    private extractKeyContent;
}
