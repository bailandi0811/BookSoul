import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusService } from '../milvus/milvus.service';
import { McpService } from '../mcp/mcp.service';
import { ToolsService } from '../tools/tools.service';
import { PersonaService } from '../persona/persona.service';
export declare class AgentService implements OnModuleInit {
    private configService;
    private milvusService;
    private mcpService;
    private toolsService;
    private personaService;
    private model;
    private embeddings;
    private readonly logger;
    constructor(configService: ConfigService, milvusService: MilvusService, mcpService: McpService, toolsService: ToolsService, personaService: PersonaService);
    onModuleInit(): Promise<void>;
    private embedQuery;
    private searchNovel;
    private analyzeQuery;
    private critiqueResults;
    private formatContext;
    streamChat(query: string, persona?: string, abortSignal?: AbortSignal): AsyncGenerator<{
        type: string;
        data: any;
    }>;
    chat(query: string, persona?: string): Promise<{
        response: string;
        references: any[];
    }>;
}
