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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChatController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const agent_service_1 = require("../agent/agent.service");
const rag_service_1 = require("../rag/rag.service");
let ChatController = ChatController_1 = class ChatController {
    agentService;
    ragService;
    logger = new common_1.Logger(ChatController_1.name);
    constructor(agentService, ragService) {
        this.agentService = agentService;
        this.ragService = ragService;
    }
    async chat(body, res, req) {
        const { message, character } = body;
        if (!message) {
            throw new common_1.BadRequestException('Message is required');
        }
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const abortController = new AbortController();
        req.on('close', () => {
            this.logger.log('Client disconnected, aborting agent stream...');
            abortController.abort();
        });
        try {
            this.logger.log(`Received question: ${message}, Character: ${character || 'assistant'}`);
            let hasSentReferences = false;
            for await (const event of this.agentService.streamChat(message, character || 'assistant', abortController.signal)) {
                switch (event.type) {
                    case 'references':
                        if (!hasSentReferences && event.data.length > 0) {
                            res.write(`data: ${JSON.stringify({ references: event.data })}\n\n`);
                            hasSentReferences = true;
                        }
                        break;
                    case 'content':
                        if (event.data) {
                            res.write(`data: ${JSON.stringify({ content: event.data })}\n\n`);
                        }
                        break;
                    case 'final':
                        break;
                    case 'error':
                        this.logger.error(`Agent error: ${event.data}`);
                        res.write(`data: ${JSON.stringify({ error: event.data })}\n\n`);
                        break;
                }
            }
            res.write('data: [DONE]\n\n');
            res.end();
        }
        catch (error) {
            this.logger.error('Chat API Error:', error);
            res.write(`data: ${JSON.stringify({ error: 'Internal Server Error' })}\n\n`);
            res.end();
        }
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "chat", null);
exports.ChatController = ChatController = ChatController_1 = __decorate([
    (0, common_1.Controller)('api/chat'),
    __metadata("design:paramtypes", [agent_service_1.AgentService,
        rag_service_1.RagService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map