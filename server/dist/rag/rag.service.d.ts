import { ConfigService } from '@nestjs/config';
import { MilvusService } from '../milvus/milvus.service';
import { McpService } from '../mcp/mcp.service';
import { ToolsService } from '../tools/tools.service';
import { Response } from 'express';
export declare class RagService {
    private configService;
    private milvusService;
    private mcpService;
    private toolsService;
    private embeddings;
    private model;
    private readonly logger;
    constructor(configService: ConfigService, milvusService: MilvusService, mcpService: McpService, toolsService: ToolsService);
    getEmbedding(text: string): Promise<number[]>;
    retrieveRelevantContent(question: string, k?: number): Promise<import("@zilliz/milvus2-sdk-node").SearchResultData[]>;
    generateResponseStream(question: string, context: string, res: Response, character?: string): Promise<void>;
}
