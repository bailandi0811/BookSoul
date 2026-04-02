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
let McpService = McpService_1 = class McpService {
    configService;
    mcpClient = null;
    logger = new common_1.Logger(McpService_1.name);
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
            fetch: {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-fetch'],
            }
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
            this.logger.log(`Loaded ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`);
            return tools;
        }
        catch (error) {
            this.logger.error('Failed to load MCP tools:', error);
            return [];
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