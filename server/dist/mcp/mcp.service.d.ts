import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
export declare class McpService implements OnModuleDestroy {
    private configService;
    private mcpClient;
    private readonly logger;
    private cachedTools;
    private toolsCachedAt;
    private toolsLoadPromise;
    private readonly TOOLS_CACHE_TTL_MS;
    constructor(configService: ConfigService);
    getMcpClient(): Promise<MultiServerMCPClient>;
    getMcpTools(): Promise<any[]>;
    onModuleDestroy(): Promise<void>;
}
