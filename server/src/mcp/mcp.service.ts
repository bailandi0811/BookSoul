import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ClientConfig,
  MultiServerMCPClient,
} from '@langchain/mcp-adapters';

export type McpTool = Awaited<
  ReturnType<MultiServerMCPClient['getTools']>
>[number];

@Injectable()
export class McpService implements OnModuleDestroy {
  private mcpClient: MultiServerMCPClient | null = null;
  private readonly logger = new Logger(McpService.name);
  private cachedTools: McpTool[] | null = null;
  private toolsCachedAt = 0;
  private toolsLoadPromise: Promise<McpTool[]> | null = null;
  private readonly TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(private configService: ConfigService) {}

  async getMcpClient(): Promise<MultiServerMCPClient> {
    if (this.mcpClient) {
      return this.mcpClient;
    }

    const mcpServers: ClientConfig['mcpServers'] = {};

    const tavilyApiKey = this.configService.get<string>('mcp.tavilyApiKey');
    if (tavilyApiKey) {
      mcpServers.tavily = {
        transport: 'http',
        url:
          this.configService.get<string>('mcp.tavilyUrl') ||
          'https://mcp.tavily.com/mcp',
        headers: {
          Authorization: `Bearer ${tavilyApiKey}`,
        },
        defaultToolTimeout:
          this.configService.get<number>('mcp.toolTimeoutMs') || 8_000,
      };
    }

    this.mcpClient = new MultiServerMCPClient({
      throwOnLoadError: true,
      useStandardContentBlocks: true,
      prefixToolNameWithServerName: false,
      mcpServers,
    });

    this.logger.log(
      `Initializing MCP client with configured servers: ${Object.keys(mcpServers).join(', ') || 'none'}`,
    );
    return this.mcpClient;
  }

  async getMcpTools(): Promise<McpTool[]> {
    const allowedToolNames = new Set(
      this.configService.get<string[]>('mcp.allowedTools') ?? [],
    );
    if (allowedToolNames.size === 0) {
      this.logger.debug(
        'MCP tools are disabled because the allowlist is empty',
      );
      return [];
    }

    if (!this.configService.get<string>('mcp.tavilyApiKey')) {
      this.logger.warn(
        'MCP tool allowlist is set, but no MCP server is configured',
      );
      return [];
    }

    const now = Date.now();
    if (
      this.cachedTools &&
      now - this.toolsCachedAt < this.TOOLS_CACHE_TTL_MS
    ) {
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
        this.logger.log(
          `Loaded ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`,
        );
        return tools;
      } catch (error) {
        const errorType = error instanceof Error ? error.name : 'UnknownError';
        this.logger.error(`Failed to load MCP tools (type=${errorType})`);
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
