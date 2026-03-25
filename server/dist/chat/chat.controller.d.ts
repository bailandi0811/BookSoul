import type { Response } from 'express';
import { RagService } from '../rag/rag.service';
export declare class ChatController {
    private readonly ragService;
    private readonly logger;
    constructor(ragService: RagService);
    chat(body: {
        message: string;
        character?: string;
    }, res: Response): Promise<void>;
}
