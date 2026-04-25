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
var UserProfileRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserProfileRepository = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let UserProfileRepository = UserProfileRepository_1 = class UserProfileRepository {
    logger = new common_1.Logger(UserProfileRepository_1.name);
    baseDir = 'memories/profiles';
    async get(userId, sessionId) {
        try {
            const filePath = this.getFilePath(userId, sessionId);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            this.logger.error(`Failed to load user profile: ${error}`);
            throw error;
        }
    }
    async save(profile) {
        try {
            const dir = path.join(process.cwd(), this.baseDir, profile.userId);
            await fs.mkdir(dir, { recursive: true });
            const filePath = path.join(dir, `${profile.sessionId}.json`);
            await fs.writeFile(filePath, JSON.stringify(profile, null, 2));
        }
        catch (error) {
            this.logger.error(`Failed to save user profile: ${error}`);
            throw error;
        }
    }
    async update(userId, sessionId, updates) {
        const existing = await this.get(userId, sessionId);
        const updated = {
            userId,
            sessionId,
            createdAt: existing?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            preferences: existing?.preferences || { favoriteCharacters: [], interests: [] },
            facts: existing?.facts || {},
            summary: existing?.summary || '',
            ...updates,
        };
        await this.save(updated);
        return updated;
    }
    async delete(userId, sessionId) {
        try {
            const filePath = this.getFilePath(userId, sessionId);
            await fs.unlink(filePath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    createDefault(userId, sessionId) {
        return {
            userId,
            sessionId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            preferences: {
                favoriteCharacters: [],
                interests: [],
            },
            facts: {},
            summary: '',
        };
    }
    getFilePath(userId, sessionId) {
        return path.join(process.cwd(), this.baseDir, userId, `${sessionId}.json`);
    }
};
exports.UserProfileRepository = UserProfileRepository;
exports.UserProfileRepository = UserProfileRepository = UserProfileRepository_1 = __decorate([
    (0, common_1.Injectable)()
], UserProfileRepository);
//# sourceMappingURL=user-profile.repository.js.map