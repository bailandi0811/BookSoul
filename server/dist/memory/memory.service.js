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
var MemoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = require("@langchain/openai");
const milvus_service_1 = require("../milvus/milvus.service");
const user_profile_repository_1 = require("./repositories/user-profile.repository");
const memory_entry_repository_1 = require("./repositories/memory-entry.repository");
const importance_scorer_strategy_1 = require("./strategies/importance-scorer.strategy");
const memory_types_1 = require("./interfaces/memory.types");
const openai_2 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const milvus2_sdk_node_1 = require("@zilliz/milvus2-sdk-node");
let MemoryService = MemoryService_1 = class MemoryService {
    configService;
    milvusService;
    userProfileRepo;
    memoryEntryRepo;
    importanceScorer;
    logger = new common_1.Logger(MemoryService_1.name);
    embeddings;
    model;
    COLLECTION_NAME = 'memory_embeddings';
    constructor(configService, milvusService, userProfileRepo, memoryEntryRepo, importanceScorer) {
        this.configService = configService;
        this.milvusService = milvusService;
        this.userProfileRepo = userProfileRepo;
        this.memoryEntryRepo = memoryEntryRepo;
        this.importanceScorer = importanceScorer;
        this.embeddings = new openai_1.OpenAIEmbeddings({
            apiKey: this.configService.get('openai.apiKey'),
            model: this.configService.get('openai.embeddingModel'),
            configuration: {
                baseURL: this.configService.get('openai.baseUrl'),
            },
            dimensions: this.configService.get('milvus.vectorDim'),
        });
        this.model = new openai_2.ChatOpenAI({
            temperature: 0.7,
            apiKey: this.configService.get('openai.apiKey'),
            model: this.configService.get('openai.chatModel'),
            configuration: {
                baseURL: this.configService.get('openai.baseUrl'),
            },
        });
    }
    async onModuleInit() {
        await this.ensureCollection();
    }
    async getOrCreateUserProfile(userId, sessionId) {
        let profile = await this.userProfileRepo.get(userId, sessionId);
        if (!profile) {
            profile = this.userProfileRepo.createDefault(userId, sessionId);
            await this.userProfileRepo.save(profile);
        }
        return profile;
    }
    async updateUserProfile(userId, sessionId, updates) {
        return this.userProfileRepo.update(userId, sessionId, updates);
    }
    async extractAndUpdateProfile(userId, sessionId, messages) {
        if (messages.length === 0) {
            return this.getOrCreateUserProfile(userId, sessionId);
        }
        const extractionPrompt = `你是一个用户信息提取助手。请从以下对话中提取用户的事实信息。

【规则】
1. 只提取明确陈述的事实，不要推测
2. 返回 JSON 格式
3. 可能的字段：name, gender, location, occupation, interests, favoriteCharacters

【对话】
${messages.map(m => `- ${m}`).join('\n')}

【输出格式】
{
  "facts": {"姓名": "...", "性别": "...", ...},
  "interests": ["武侠", "历史", ...],
  "preferences": {"favoriteCharacters": ["乔峰", ...]},
  "summary": "用户是一个..."
}`;
        try {
            const response = await this.model.invoke([new messages_1.HumanMessage(extractionPrompt)]);
            const extracted = JSON.parse(response.content);
            const profile = await this.getOrCreateUserProfile(userId, sessionId);
            const updated = await this.userProfileRepo.update(userId, sessionId, {
                facts: { ...profile.facts, ...extracted.facts },
                preferences: {
                    favoriteCharacters: extracted.preferences?.favoriteCharacters || profile.preferences.favoriteCharacters,
                    interests: extracted.interests || profile.preferences.interests,
                },
                summary: extracted.summary || profile.summary,
            });
            return updated;
        }
        catch (error) {
            this.logger.error(`Failed to extract user profile: ${error}`);
            return this.getOrCreateUserProfile(userId, sessionId);
        }
    }
    async scoreImportance(message, context = []) {
        return this.importanceScorer.score(message, context);
    }
    async processAndStoreMemory(userId, sessionId, message) {
        const importanceScore = await this.scoreImportance(message);
        if (importanceScore.score < 0.55) {
            return { hasNewMemories: false, memoryCount: 0 };
        }
        const memoryEntry = {
            id: this.memoryEntryRepo.generateId(),
            userId,
            sessionId,
            level: importanceScore.suggestedLevel,
            content: importanceScore.extractContent || message,
            importance: importanceScore.score,
            category: this.determineCategory(message),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {
                sourceMessage: message,
                extractReason: importanceScore.reasons.join('; '),
                editable: true,
                verified: false,
            },
        };
        await this.memoryEntryRepo.save(memoryEntry);
        if (importanceScore.suggestedLevel === memory_types_1.MemoryLevel.LONG_TERM && memoryEntry.vector) {
            await this.storeToMilvus(memoryEntry);
        }
        return { hasNewMemories: true, memoryCount: 1 };
    }
    determineCategory(message) {
        if (/喜欢|讨厌|偏好|兴趣/.test(message))
            return memory_types_1.MemoryCategory.PREFERENCE;
        if (/名字|我叫|我是|住在|工作/.test(message))
            return memory_types_1.MemoryCategory.FACT;
        return memory_types_1.MemoryCategory.OTHER;
    }
    async getMemories(userId, sessionId, level) {
        if (level) {
            return this.memoryEntryRepo.getByLevel(userId, level, sessionId);
        }
        return this.memoryEntryRepo.getByUserId(userId, sessionId);
    }
    async updateMemory(memoryId, userId, updates) {
        return this.memoryEntryRepo.update(memoryId, userId, updates);
    }
    async deleteMemory(memoryId, userId) {
        await this.memoryEntryRepo.delete(memoryId, userId);
        try {
            await this.milvusService.getClient().delete({
                collection_name: this.COLLECTION_NAME,
                filter: `id == "${memoryId}"`,
            });
        }
        catch (e) {
            this.logger.warn(`Failed to delete from Milvus: ${e}`);
        }
    }
    async searchMemories(query, userId, topK = 5) {
        try {
            const queryVector = await this.embeddings.embedQuery(query);
            const results = await this.milvusService.getClient().search({
                collection_name: this.COLLECTION_NAME,
                vector: queryVector,
                limit: topK,
                filter: `user_id == "${userId}"`,
                metric_type: milvus2_sdk_node_1.MetricType.COSINE,
                output_fields: ['*'],
            });
            if (!results.results || results.results.length === 0) {
                return [];
            }
            return results.results.map(r => ({
                id: r.id,
                userId: r.user_id,
                sessionId: r.session_id,
                level: r.level,
                content: r.content,
                importance: r.importance,
                category: r.category,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                metadata: r.metadata,
            }));
        }
        catch (error) {
            this.logger.warn(`Milvus search failed, falling back to text search: ${error}`);
            const all = await this.memoryEntryRepo.getByUserId(userId);
            const queryLower = query.toLowerCase();
            return all.filter(m => m.content.toLowerCase().includes(queryLower)).slice(0, topK);
        }
    }
    async ensureCollection() {
        try {
            const client = this.milvusService.getClient();
            const collections = await client.describeCollection({ collection_name: this.COLLECTION_NAME });
            if (!collections) {
                await client.createCollection({
                    collection_name: this.COLLECTION_NAME,
                    dimension: this.configService.get('milvus.vectorDim') || 1024,
                    metric_type: milvus2_sdk_node_1.MetricType.COSINE,
                });
                await client.createIndex({
                    collection_name: this.COLLECTION_NAME,
                    field_name: 'vector',
                    index_type: 'IVF_FLAT',
                });
            }
        }
        catch (error) {
            this.logger.log(`Memory collection initialized`);
        }
    }
    async storeToMilvus(memory) {
        try {
            const vector = await this.embeddings.embedQuery(memory.content);
            memory.vector = vector;
            await this.milvusService.getClient().insert({
                collection_name: this.COLLECTION_NAME,
                data: [{
                        id: memory.id,
                        user_id: memory.userId,
                        session_id: memory.sessionId,
                        content: memory.content,
                        vector: vector,
                        level: memory.level,
                        importance: memory.importance,
                        category: memory.category,
                        created_at: memory.createdAt,
                    }],
            });
        }
        catch (error) {
            this.logger.error(`Failed to store memory to Milvus: ${error}`);
        }
    }
};
exports.MemoryService = MemoryService;
exports.MemoryService = MemoryService = MemoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        milvus_service_1.MilvusService,
        user_profile_repository_1.UserProfileRepository,
        memory_entry_repository_1.MemoryEntryRepository,
        importance_scorer_strategy_1.ImportanceScorerStrategy])
], MemoryService);
//# sourceMappingURL=memory.service.js.map