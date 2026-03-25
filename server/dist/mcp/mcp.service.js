"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var McpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mcp_adapters_1 = require("@langchain/mcp-adapters");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
let McpService = McpService_1 = class McpService {
    configService;
    mcpClient = null;
    logger = new common_1.Logger(McpService_1.name);
    ipInfoTool = new tools_1.DynamicStructuredTool({
        name: 'get_current_location',
        description: "获取用户当前的 IP 地址及精确的地理位置信息（城市、省份、国家、经纬度）。当用户询问'我在哪'或'我在什么地方'等需要定位时调用。",
        schema: zod_1.z.object({}),
        func: async () => {
            try {
                const amapKey = this.configService.get('mcp.amapApiKey');
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
            }
            catch (error) {
                this.logger.warn(`Primary IP services failed, trying backup... ${error.message}`);
            }
            try {
                const backupResponse = await fetch('http://ip-api.com/json', { signal: AbortSignal.timeout(5000) });
                if (!backupResponse.ok)
                    throw new Error(`HTTP ${backupResponse.status}`);
                const backupData = await backupResponse.json();
                return JSON.stringify(backupData, null, 2);
            }
            catch (backupError) {
                return `无法获取位置信息 (所有服务均不可用): ${backupError.message}. 请告诉用户你无法定位他的位置。`;
            }
        },
    });
    constructor(configService) {
        this.configService = configService;
    }
    async getMcpClient() {
        if (this.mcpClient) {
            return this.mcpClient;
        }
        const mcpServers = {
            filesystem: {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
            },
        };
        const amapApiKey = this.configService.get('mcp.amapApiKey');
        if (amapApiKey) {
            mcpServers['amap-maps-streamableHTTP'] = {
                url: `https://mcp.amap.com/mcp?key=${amapApiKey}`,
            };
        }
        this.mcpClient = new mcp_adapters_1.MultiServerMCPClient({
            mcpServers: mcpServers,
        });
        this.logger.log(`Initializing MCP Client with servers: ${Object.keys(mcpServers).join(', ')}`);
        return this.mcpClient;
    }
    async getMcpTools() {
        try {
            const client = await this.getMcpClient();
            const tools = await client.getTools();
            const allTools = [...tools, this.ipInfoTool];
            this.logger.log(`Loaded ${allTools.length} tools: ${allTools.map((t) => t.name).join(', ')}`);
            return allTools;
        }
        catch (error) {
            this.logger.error('Failed to load MCP tools:', error);
            return [this.ipInfoTool];
        }
    }
    async onModuleDestroy() {
        if (this.mcpClient) {
            if (typeof this.mcpClient.close === 'function') {
                await this.mcpClient.close();
            }
            this.mcpClient = null;
        }
    }
};
exports.McpService = McpService;
exports.McpService = McpService = McpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], McpService);
//# sourceMappingURL=mcp.service.js.map