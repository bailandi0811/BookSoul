import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

@Injectable()
export class McpService implements OnModuleDestroy {
  private mcpClient: MultiServerMCPClient | null = null;
  private readonly logger = new Logger(McpService.name);

  constructor(private configService: ConfigService) {}

  async getMcpClient(): Promise<MultiServerMCPClient> {
    if (this.mcpClient) {
      return this.mcpClient;
    }

    const mcpServers: Record<string, any> = {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
      },
      // 引入了外部的 fetch MCP Server 来替代手写的定位功能
      // 它可以发起网络请求，配合提示词可以让 Agent 自由调用 IP 定位 API
      fetch: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch'],
      }
    };

    const amapApiKey = this.configService.get<string>('mcp.amapApiKey');
    if (amapApiKey) {
      mcpServers['amap-maps-streamableHTTP'] = {
        url: `https://mcp.amap.com/mcp?key=${amapApiKey}`,
      };
    }

    this.mcpClient = new MultiServerMCPClient({
      mcpServers: mcpServers,
    });

    this.logger.log(`Initializing MCP Client with servers: ${Object.keys(mcpServers).join(', ')}`);
    return this.mcpClient;
  }

  async getMcpTools(): Promise<any[]> {
    try {
      const client = await this.getMcpClient();
      const tools = await client.getTools();
      this.logger.log(`Loaded ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`);
      return tools;
    } catch (error) {
      this.logger.error('Failed to load MCP tools:', error);
      return [];
    }
  }

  async onModuleDestroy() {
    if (this.mcpClient) {
      // @ts-ignore
      if (typeof this.mcpClient.close === 'function') {
        // @ts-ignore
        await this.mcpClient.close();
      }
      this.mcpClient = null;
    }
  }
}
