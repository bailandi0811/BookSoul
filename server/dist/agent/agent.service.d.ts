import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusService } from '../milvus/milvus.service';
import { McpService } from '../mcp/mcp.service';
import { ToolsService } from '../tools/tools.service';
import { PersonaService } from '../persona/persona.service';
import { MemoryService } from '../memory/memory.service';
export declare class AgentService implements OnModuleInit {
    private configService;
    private milvusService;
    private mcpService;
    private toolsService;
    private personaService;
    private memoryService;
    private model;
    private embeddings;
    private readonly logger;
    private embeddingCache;
    private readonly EMBEDDING_CACHE_TTL_MS;
    private readonly EMBEDDING_CACHE_MAX_SIZE;
    constructor(configService: ConfigService, milvusService: MilvusService, mcpService: McpService, toolsService: ToolsService, personaService: PersonaService, memoryService: MemoryService);
    onModuleInit(): Promise<void>;
    private embedQuery;
    private searchNovel;
    private analyzeQuery;
    private formatContext;
    private extractTextFromContentArray;
    private extractTextFromChunk;
    private createSearchNovelExpertTool;
    private createRetrieverNodeForRAG;
    streamChat(query: string, persona?: string, sessionId?: string, userId?: string, abortSignal?: AbortSignal): AsyncGenerator<{
        type: string;
        data: any;
    }>;
    chat(query: string, persona?: string, sessionId?: string, userId?: string): Promise<{
        response: string;
        references: any[];
    }>;
    getHistoryList(): Promise<{
        sessionId: string;
        title: string;
        updatedAt: number;
    }[]>;
    getSessionHistory(sessionId: string): Promise<any[]>;
    deleteSession(sessionId: string): Promise<boolean>;
}
