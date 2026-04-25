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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryController = void 0;
const common_1 = require("@nestjs/common");
const memory_service_1 = require("./memory.service");
const memory_types_1 = require("./interfaces/memory.types");
let MemoryController = class MemoryController {
    memoryService;
    constructor(memoryService) {
        this.memoryService = memoryService;
    }
    async getProfile(userId, sessionId) {
        return this.memoryService.getOrCreateUserProfile(userId, sessionId);
    }
    async updateProfile(userId, sessionId, body) {
        return this.memoryService.updateUserProfile(userId, sessionId, body);
    }
    async getMemories(userId, sessionId, level) {
        return this.memoryService.getMemories(userId, sessionId, level);
    }
    async createMemory(body) {
        return this.memoryService.processAndStoreMemory(body.userId, body.sessionId, body.content);
    }
    async updateMemory(memoryId, body) {
        return this.memoryService.updateMemory(memoryId, body.userId, body);
    }
    async deleteMemory(memoryId, userId) {
        await this.memoryService.deleteMemory(memoryId, userId);
        return { success: true };
    }
    async searchMemories(userId, query, topK = 5) {
        return this.memoryService.searchMemories(query, userId, topK);
    }
};
exports.MemoryController = MemoryController;
__decorate([
    (0, common_1.Get)('profile/:userId/:sessionId'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Patch)('profile/:userId/:sessionId'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Param)('sessionId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Get)(':userId/:sessionId'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Param)('sessionId')),
    __param(2, (0, common_1.Query)('level')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getMemories", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "createMemory", null);
__decorate([
    (0, common_1.Patch)(':memoryId'),
    __param(0, (0, common_1.Param)('memoryId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "updateMemory", null);
__decorate([
    (0, common_1.Delete)(':memoryId'),
    __param(0, (0, common_1.Param)('memoryId')),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "deleteMemory", null);
__decorate([
    (0, common_1.Get)('search/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Query)('q')),
    __param(2, (0, common_1.Query)('topK')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "searchMemories", null);
exports.MemoryController = MemoryController = __decorate([
    (0, common_1.Controller)('api/memory'),
    __metadata("design:paramtypes", [memory_service_1.MemoryService])
], MemoryController);
//# sourceMappingURL=memory.controller.js.map