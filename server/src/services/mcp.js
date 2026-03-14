import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { config } from '../config.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

let mcpClient = null;

// 自定义 IP 定位工具
const ipInfoTool = new DynamicStructuredTool({
    name: "get_current_location",
    description: "获取用户当前的 IP 地址及地理位置信息（城市、国家、经纬度）。当用户询问'我在哪'或'我在什么地方'等需要定位时调用。",
    schema: z.object({}),
    func: async () => {
        try {
            // 尝试首选 IP 服务
            const response = await fetch("https://ipapi.co/json", { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return JSON.stringify(data, null, 2);
        } catch (error) {
            console.warn('First IP service failed, trying backup...', error.message);
            try {
                // 备用 IP 服务
                const backupResponse = await fetch("http://ip-api.com/json", { signal: AbortSignal.timeout(5000) });
                if (!backupResponse.ok) throw new Error(`HTTP ${backupResponse.status}`);
                const backupData = await backupResponse.json();
                return JSON.stringify(backupData, null, 2);
            } catch (backupError) {
                return `无法获取位置信息 (所有服务均不可用): ${backupError.message}. 请告诉用户你无法定位他的位置。`;
            }
        }
    }
});

export async function getMcpClient() {
    if (mcpClient) {
        return mcpClient;
    }

    const mcpServers = {
        "filesystem": {
            "command": "npx",
            "args": [
                "-y",
                "@modelcontextprotocol/server-filesystem",
                process.cwd()
            ]
        }
    };

    if (config.mcp.amapApiKey) {
        mcpServers["amap-maps-streamableHTTP"] = {
            url: `https://mcp.amap.com/mcp?key=${config.mcp.amapApiKey}`
        };
    }

    mcpClient = new MultiServerMCPClient({
        mcpServers: mcpServers
    });

    console.log('Initializing MCP Client with servers:', Object.keys(mcpServers));
    return mcpClient;
}

export async function getMcpTools() {
    try {
        const client = await getMcpClient();
        const tools = await client.getTools();
        
        // 合并 MCP 工具和自定义工具
        const allTools = [...tools, ipInfoTool];
        
        console.log(`Loaded ${allTools.length} tools:`, allTools.map(t => t.name).join(', '));
        return allTools;
    } catch (error) {
        console.error('Failed to load MCP tools:', error);
        return [ipInfoTool]; // 即使 MCP 失败，至少返回自定义工具
    }
}

export async function closeMcpClient() {
    if (mcpClient) {
        await mcpClient.close();
        mcpClient = null;
    }
}
