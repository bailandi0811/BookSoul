"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var MemoryEntryRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryEntryRepository = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let MemoryEntryRepository = MemoryEntryRepository_1 = class MemoryEntryRepository {
    logger = new common_1.Logger(MemoryEntryRepository_1.name);
    baseDir = 'memories/long_term';
    async getById(memoryId, userId) {
        try {
            const filePath = this.getFilePath(userId, memoryId);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            this.logger.error(`Failed to load memory entry: ${error}`);
            throw error;
        }
    }
    async getByUserId(userId, sessionId) {
        try {
            const dir = path.join(process.cwd(), this.baseDir, userId);
            await fs.mkdir(dir, { recursive: true });
            const files = await fs.readdir(dir);
            const entries = [];
            for (const file of files) {
                if (!file.endsWith('.json'))
                    continue;
                if (sessionId && !file.includes(sessionId))
                    continue;
                try {
                    const data = await fs.readFile(path.join(dir, file), 'utf-8');
                    const entry = JSON.parse(data);
                    entries.push(entry);
                }
                catch (e) {
                    this.logger.warn(`Failed to parse memory file ${file}: ${e}`);
                }
            }
            return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        catch (error) {
            this.logger.error(`Failed to load memory entries: ${error}`);
            return [];
        }
    }
    async getByLevel(userId, level, sessionId) {
        const all = await this.getByUserId(userId, sessionId);
        return all.filter(e => e.level === level);
    }
    async save(entry) {
        try {
            const dir = path.join(process.cwd(), this.baseDir, entry.userId);
            await fs.mkdir(dir, { recursive: true });
            const filePath = path.join(dir, `${entry.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
        }
        catch (error) {
            this.logger.error(`Failed to save memory entry: ${error}`);
            throw error;
        }
    }
    async delete(memoryId, userId) {
        try {
            const filePath = this.getFilePath(userId, memoryId);
            await fs.unlink(filePath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    async update(memoryId, userId, updates) {
        const existing = await this.getById(memoryId, userId);
        if (!existing)
            return null;
        const updated = {
            ...existing,
            ...updates,
            id: existing.id,
            userId: existing.userId,
            updatedAt: new Date().toISOString(),
        };
        await this.save(updated);
        return updated;
    }
    generateId() {
        return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getFilePath(userId, memoryId) {
        return path.join(process.cwd(), this.baseDir, userId, `${memoryId}.json`);
    }
};
exports.MemoryEntryRepository = MemoryEntryRepository;
exports.MemoryEntryRepository = MemoryEntryRepository = MemoryEntryRepository_1 = __decorate([
    (0, common_1.Injectable)()
], MemoryEntryRepository);
//# sourceMappingURL=memory-entry.repository.js.map