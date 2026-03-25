import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

@Injectable()
export class McpService implements OnModuleDestroy {
  private mcpClient: MultiServerMCPClient | null = null;
  private readonly logger = new Logger(McpService.name);

  private readonly ipInfoTool = new DynamicStructuredTool({
    name: 'get_current_location',
    description: "获取用户当前的 IP 地址及精确的地理位置信息（城市、省份、国家、经纬度）。当用户询问'我在哪'或'我在什么地方'等需要定位时调用。",
    schema: z.object({}),
    func: async () => {
      try {
        // 使用高德地图 IP 定位 API（更准确的国内定位）
        // 如果环境变量中没有配置高德 Key，则回退到备用方案
        const amapKey = this.configService.get<string>('mcp.amapApiKey');
        if (amapKey) {
          const amapResponse = await fetch(`https://restapi.amap.com/v3/ip?key=${amapKey}`, { signal: AbortSignal.timeout(5000) });
          if (amapResponse.ok) {
            const amapData = await amapResponse.json();
            if (amapData.status === '1' && typeof amapData.city === 'string' && amapData.city.length > 0) {
              return JSON.stringify({
                country: "China",
                regionName: amapData.province,
                city: amapData.city,
                provider: "Amap (高德地图)"
              }, null, 2);
            }
          }
        }
        
        // 备用方案 1：太平洋网络 IP 接口（国内较准）
        const pconlineResponse = await fetch('https://whois.pconline.com.cn/ipJson.jsp?json=true', { signal: AbortSignal.timeout(5000) });
        if (pconlineResponse.ok) {
           const pconlineData = await pconlineResponse.json();
           return JSON.stringify({
              country: "China",
              regionName: pconlineData.pro,
              city: pconlineData.city,
              provider: "PConline"
           }, null, 2);
        }
        
      } catch (error: any) {
        this.logger.warn(`Primary IP services failed, trying backup... ${error.message}`);
      }
      
      // 最终兜底方案
      try {
        const backupResponse = await fetch('http://ip-api.com/json', { signal: AbortSignal.timeout(5000) });
        if (!backupResponse.ok) throw new Error(`HTTP ${backupResponse.status}`);
        const backupData = await backupResponse.json();
        return JSON.stringify(backupData, null, 2);
      } catch (backupError: any) {
        return `无法获取位置信息 (所有服务均不可用): ${backupError.message}. 请告诉用户你无法定位他的位置。`;
      }
    },
  });

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

      const allTools = [...tools, this.ipInfoTool];
      this.logger.log(`Loaded ${allTools.length} tools: ${allTools.map((t) => t.name).join(', ')}`);
      return allTools;
    } catch (error) {
      this.logger.error('Failed to load MCP tools:', error);
      return [this.ipInfoTool];
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
