import type { Response, Request } from 'express';
import { AgentService } from '../agent/agent.service';
import { RagService } from '../rag/rag.service';
export declare class ChatController {
    private readonly agentService;
    private readonly ragService;
    private readonly logger;
    constructor(agentService: AgentService, ragService: RagService);
    chat(body: {
        message: string;
        character?: string;
        sessionId?: string;
    }, res: Response, req: Request): Promise<void>;
}
