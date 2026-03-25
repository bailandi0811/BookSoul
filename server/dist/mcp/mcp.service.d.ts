import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
export declare class McpService implements OnModuleDestroy {
    private configService;
    private mcpClient;
    private readonly logger;
    private readonly ipInfoTool;
    constructor(configService: ConfigService);
    getMcpClient(): Promise<MultiServerMCPClient>;
    getMcpTools(): Promise<any[]>;
    onModuleDestroy(): Promise<void>;
}
