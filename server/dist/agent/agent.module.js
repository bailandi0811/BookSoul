"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentModule = void 0;
const common_1 = require("@nestjs/common");
const agent_service_1 = require("./agent.service");
const milvus_module_1 = require("../milvus/milvus.module");
const mcp_module_1 = require("../mcp/mcp.module");
const tools_module_1 = require("../tools/tools.module");
const persona_module_1 = require("../persona/persona.module");
const memory_module_1 = require("../memory/memory.module");
let AgentModule = class AgentModule {
};
exports.AgentModule = AgentModule;
exports.AgentModule = AgentModule = __decorate([
    (0, common_1.Module)({
        imports: [milvus_module_1.MilvusModule, mcp_module_1.McpModule, tools_module_1.ToolsModule, persona_module_1.PersonaModule, memory_module_1.MemoryModule],
        providers: [agent_service_1.AgentService],
        exports: [agent_service_1.AgentService],
    })
], AgentModule);
//# sourceMappingURL=agent.module.js.map