import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

@Injectable()
export class McpService implements OnModuleDestroy {
  private mcpClient: MultiServerMCPClient | null = null;
  private readonly logger = new Logger(McpService.name);
  private cachedTools: any[] | null = null;
  private toolsCachedAt = 0;
  private toolsLoadPromise: Promise<any[]> | null = null;
  private readonly TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(private configService: ConfigService) {}

  async getMcpClient(): Promise<MultiServerMCPClient> {
    if (this.mcpClient) {
      return this.mcpClient;
    }

    const mcpServers: Record<string, { url: string }> = {};

    const amapApiKey = this.configService.get<string>('mcp.amapApiKey');
    if (amapApiKey) {
      mcpServers['amap-maps-streamableHTTP'] = {
        url: `https://mcp.amap.com/mcp?key=${amapApiKey}`,
      };
    }

    this.mcpClient = new MultiServerMCPClient({
      mcpServers: mcpServers,
    });

    this.logger.log(
      `Initializing MCP client with configured servers: ${Object.keys(mcpServers).join(', ') || 'none'}`,
    );
    return this.mcpClient;
  }

  async getMcpTools(): Promise<any[]> {
    const allowedToolNames = new Set(
      this.configService.get<string[]>('mcp.allowedTools') ?? [],
    );
    if (allowedToolNames.size === 0) {
      this.logger.debug('MCP tools are disabled because the allowlist is empty');
      return [];
    }

    if (!this.configService.get<string>('mcp.amapApiKey')) {
      this.logger.warn('MCP tool allowlist is set, but no MCP server is configured');
      return [];
    }

    const now = Date.now();
    if (this.cachedTools && now - this.toolsCachedAt < this.TOOLS_CACHE_TTL_MS) {
      return this.cachedTools;
    }

    if (this.toolsLoadPromise) {
      return this.toolsLoadPromise;
    }

    this.toolsLoadPromise = (async () => {
      try {
        const client = await this.getMcpClient();
        const tools = (await client.getTools()).filter((candidate) =>
          allowedToolNames.has(candidate.name),
        );
        this.cachedTools = tools;
        this.toolsCachedAt = Date.now();
        this.logger.log(`Loaded ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`);
        return tools;
      } catch (error) {
        this.logger.error('Failed to load MCP tools:', error);
        return [];
      } finally {
        this.toolsLoadPromise = null;
      }
    })();

    return this.toolsLoadPromise;
  }

  async onModuleDestroy() {
    if (this.mcpClient) {
      const closeableClient = this.mcpClient as MultiServerMCPClient & {
        close?: () => Promise<void>;
      };
      if (typeof closeableClient.close === 'function') {
        await closeableClient.close();
      }
      this.mcpClient = null;
    }
    this.cachedTools = null;
    this.toolsCachedAt = 0;
    this.toolsLoadPromise = null;
  }
}
