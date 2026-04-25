import type { Response, Request } from 'express';
import { AgentService } from '../agent/agent.service';
import { RagService } from '../rag/rag.service';
export declare class ChatController {
    private readonly agentService;
    private readonly ragService;
    private readonly logger;
    constructor(agentService: AgentService, ragService: RagService);
    getHistoryList(): Promise<{
        success: boolean;
        data: {
            sessionId: string;
            title: string;
            updatedAt: number;
        }[];
        error?: undefined;
    } | {
        success: boolean;
        error: string;
        data?: undefined;
    }>;
    getSessionHistory(sessionId: string): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        error: string;
        data?: undefined;
    }>;
    deleteSession(sessionId: string): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: string;
    }>;
    chat(body: {
        message: string;
        character?: string;
        sessionId?: string;
        userId?: string;
    }, res: Response, req: Request): Promise<void>;
}
