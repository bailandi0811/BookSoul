"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ImportanceScorerStrategy_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportanceScorerStrategy = void 0;
const common_1 = require("@nestjs/common");
const memory_types_1 = require("../interfaces/memory.types");
let ImportanceScorerStrategy = ImportanceScorerStrategy_1 = class ImportanceScorerStrategy {
    logger = new common_1.Logger(ImportanceScorerStrategy_1.name);
    HIGH_IMPORTANCE_PATTERNS = [
        /我的名字是([^。]+)/i,
        /我叫([^。，]+)/i,
        /我是([^，]+)[人女生男孩]/i,
        /我喜欢([^。，]+)/i,
        /我不喜欢([^。，]+)/i,
        /我在([^，]+)[住生活工作]/i,
        /我的([^，]+)[是有个]/,
        /我想写小说/i,
        /我的小说是/i,
    ];
    MEDIUM_IMPORTANCE_PATTERNS = [
        /谢谢/,
        /记住了/,
        /以后/,
        /下次/,
        /记住/,
        /关于.*说/i,
        /其实.*是/i,
    ];
    async score(message, context = []) {
        let score = 0.5;
        const reasons = [];
        for (const pattern of this.HIGH_IMPORTANCE_PATTERNS) {
            if (pattern.test(message)) {
                score += 0.3;
                reasons.push('包含个人信息或重要偏好关键词');
                break;
            }
        }
        for (const pattern of this.MEDIUM_IMPORTANCE_PATTERNS) {
            if (pattern.test(message)) {
                score += 0.1;
                reasons.push('包含偏好指示词');
                break;
            }
        }
        if (message.length < 5) {
            score -= 0.2;
            reasons.push('消息过短');
        }
        else if (message.length > 20) {
            score += 0.1;
            reasons.push('消息内容丰富');
        }
        if (/喜|讨厌|偏好|兴趣|喜欢/.test(message)) {
            score += 0.15;
            reasons.push('包含偏好相关词汇');
        }
        let suggestedLevel = memory_types_1.MemoryLevel.EPISODIC;
        if (score >= 0.7) {
            suggestedLevel = memory_types_1.MemoryLevel.LONG_TERM;
        }
        else if (score >= 0.55) {
            suggestedLevel = memory_types_1.MemoryLevel.SEMANTIC;
        }
        return {
            score: Math.min(1, Math.max(0, score)),
            reasons,
            suggestedLevel,
            extractContent: this.extractKeyContent(message),
        };
    }
    extractKeyContent(message) {
        for (const pattern of this.HIGH_IMPORTANCE_PATTERNS) {
            const match = message.match(pattern);
            if (match) {
                return match[0];
            }
        }
        return message.length > 100 ? message.substring(0, 100) + '...' : message;
    }
};
exports.ImportanceScorerStrategy = ImportanceScorerStrategy;
exports.ImportanceScorerStrategy = ImportanceScorerStrategy = ImportanceScorerStrategy_1 = __decorate([
    (0, common_1.Injectable)()
], ImportanceScorerStrategy);
//# sourceMappingURL=importance-scorer.strategy.js.map