import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MilvusService } from '../milvus/milvus.service';
import { UserProfileRepository } from './repositories/user-profile.repository';
import { MemoryEntryRepository } from './repositories/memory-entry.repository';
import { ImportanceScorerStrategy } from './strategies/importance-scorer.strategy';
import {
  UserProfile,
  MemoryEntry,
  MemoryLevel,
  MemoryCategory,
  ImportanceScore,
  MemoryUpdateEvent,
} from './interfaces/memory.types';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { DataType, IndexType, MetricType } from '@zilliz/milvus2-sdk-node';
import { CreateMemoryDto, UpdateMemoryDto } from './dto/memory.dto';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly embeddings: OpenAIEmbeddings;
  private readonly model: ChatOpenAI;
  private readonly COLLECTION_NAME = 'memory_embeddings';

  constructor(
    private configService: ConfigService,
    private milvusService: MilvusService,
    private userProfileRepo: UserProfileRepository,
    private memoryEntryRepo: MemoryEntryRepository,
    private importanceScorer: ImportanceScorerStrategy,
  ) {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('openai.apiKey'),
      model: this.configService.get<string>('openai.embeddingModel'),
      configuration: {
        baseURL: this.configService.get<string>('openai.baseUrl'),
      },
      dimensions: this.configService.get<number>('milvus.vectorDim'),
    });

    this.model = new ChatOpenAI({
      temperature: 0.7,
      apiKey: this.configService.get<string>('openai.apiKey'),
      model: this.configService.get<string>('openai.chatModel'),
      configuration: {
        baseURL: this.configService.get<string>('openai.baseUrl'),
      },
    });
  }

  async onModuleInit() {
    await this.ensureCollection();
  }

  // ========== User Profile ==========

  async getOrCreateUserProfile(userId: string, sessionId: string): Promise<UserProfile> {
    let profile = await this.userProfileRepo.get(userId, sessionId);
    if (!profile) {
      profile = this.userProfileRepo.createDefault(userId, sessionId);
      await this.userProfileRepo.save(profile);
    }
    return profile;
  }

  async updateUserProfile(userId: string, sessionId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    return this.userProfileRepo.update(userId, sessionId, updates);
  }

  async extractAndUpdateProfile(userId: string, sessionId: string, messages: string[]): Promise<UserProfile> {
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
      const response = await this.model.invoke([new HumanMessage(extractionPrompt)]);
      const extracted = JSON.parse(response.content as string);

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
    } catch (error) {
      this.logger.error(`Failed to extract user profile: ${error}`);
      return this.getOrCreateUserProfile(userId, sessionId);
    }
  }

  // ========== Importance & Memory ==========

  async scoreImportance(message: string, context: string[] = []): Promise<ImportanceScore> {
    return this.importanceScorer.score(message, context);
  }

  async processAndStoreMemory(userId: string, sessionId: string, message: string): Promise<MemoryUpdateEvent> {
    const importanceScore = await this.scoreImportance(message);

    // Only store if importance >= 0.55
    if (importanceScore.score < 0.55) {
      return { hasNewMemories: false, memoryCount: 0 };
    }

    const memoryEntry: MemoryEntry = {
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

    await this.persistMemory(memoryEntry);

    return { hasNewMemories: true, memoryCount: 1 };
  }

  private determineCategory(message: string): MemoryCategory {
    if (/喜欢|讨厌|偏好|兴趣/.test(message)) return MemoryCategory.PREFERENCE;
    if (/名字|我叫|我是|住在|工作/.test(message)) return MemoryCategory.FACT;
    return MemoryCategory.OTHER;
  }

  // ========== Memory CRUD ==========

  async createMemory(
    userId: string,
    input: CreateMemoryDto,
  ): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: this.memoryEntryRepo.generateId(),
      userId,
      sessionId: input.sessionId,
      level: input.level ?? MemoryLevel.LONG_TERM,
      content: input.content.trim(),
      importance: 0.75,
      category: input.category ?? this.determineCategory(input.content),
      createdAt: now,
      updatedAt: now,
      metadata: {
        editable: true,
        verified: true,
        extractReason: '用户手动添加',
      },
    };
    await this.persistMemory(entry);
    return entry;
  }

  async getMemories(userId: string, sessionId: string, level?: MemoryLevel): Promise<MemoryEntry[]> {
    if (level) {
      return this.memoryEntryRepo.getByLevel(userId, level, sessionId);
    }
    return this.memoryEntryRepo.getByUserId(userId, sessionId);
  }

  async updateMemory(
    memoryId: string,
    userId: string,
    updates: UpdateMemoryDto,
  ): Promise<MemoryEntry | null> {
    const existing = await this.memoryEntryRepo.getById(memoryId, userId);
    if (!existing) return null;

    const updated = await this.memoryEntryRepo.update(memoryId, userId, {
      ...(updates.content === undefined
        ? {}
        : { content: updates.content.trim() }),
      ...(updates.importance === undefined
        ? {}
        : { importance: updates.importance }),
      ...(updates.verified === undefined
        ? {}
        : {
            metadata: {
              ...existing.metadata,
              verified: updates.verified,
            },
          }),
    });
    if (
      updated &&
      updates.content !== undefined &&
      updated.level === MemoryLevel.LONG_TERM
    ) {
      await this.storeToMilvus(updated);
    }
    return updated;
  }

  async deleteMemory(memoryId: string, userId: string): Promise<void> {
    const ownedMemory = await this.memoryEntryRepo.getById(memoryId, userId);
    if (!ownedMemory) return;
    await this.memoryEntryRepo.delete(memoryId, userId);
    // 从 Milvus 中也删除
    try {
      await this.milvusService.getClient().delete({
        collection_name: this.COLLECTION_NAME,
        filter: `id == "${memoryId}" && user_id == "${userId}"`,
      });
    } catch (e) {
      this.logger.warn(`Failed to delete from Milvus: ${e}`);
    }
  }

  // ========== Semantic Search ==========

  async searchMemories(query: string, userId: string, topK: number = 5): Promise<MemoryEntry[]> {
    try {
      const queryVector = await this.embeddings.embedQuery(query);
      const results = await this.milvusService.getClient().search({
        collection_name: this.COLLECTION_NAME,
        vector: queryVector,
        limit: topK,
        filter: `user_id == "${userId}"`,
        metric_type: MetricType.COSINE,
        output_fields: ['*'],
      });

      if (!results.results || results.results.length === 0) {
        return [];
      }

      return results.results.map(r => ({
        id: r.id as string,
        userId: r.user_id as string,
        sessionId: r.session_id as string,
        level: r.level as MemoryLevel,
        content: r.content as string,
        importance: r.importance as number,
        category: r.category as MemoryCategory,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
        metadata: r.metadata as any,
      }));
    } catch (error) {
      this.logger.warn(`Milvus search failed, falling back to text search: ${error}`);
      // Fallback to text-based search
      const all = await this.memoryEntryRepo.getByUserId(userId);
      const queryLower = query.toLowerCase();
      return all.filter(m => m.content.toLowerCase().includes(queryLower)).slice(0, topK);
    }
  }

  // ========== Milvus Integration ==========

  private async ensureCollection(): Promise<void> {
    try {
      const client = this.milvusService.getClient();
      const collection = await client.hasCollection({
        collection_name: this.COLLECTION_NAME,
      });
      if (!collection.value) {
        const vectorDim =
          this.configService.get<number>('milvus.vectorDim') || 1024;
        await client.createCollection({
          collection_name: this.COLLECTION_NAME,
          fields: [
            {
              name: 'id',
              data_type: DataType.VarChar,
              max_length: 128,
              is_primary_key: true,
            },
            { name: 'user_id', data_type: DataType.VarChar, max_length: 128 },
            { name: 'session_id', data_type: DataType.VarChar, max_length: 128 },
            { name: 'content', data_type: DataType.VarChar, max_length: 4_000 },
            { name: 'vector', data_type: DataType.FloatVector, dim: vectorDim },
            { name: 'level', data_type: DataType.VarChar, max_length: 32 },
            { name: 'importance', data_type: DataType.Float },
            { name: 'category', data_type: DataType.VarChar, max_length: 32 },
            { name: 'created_at', data_type: DataType.VarChar, max_length: 40 },
            { name: 'updated_at', data_type: DataType.VarChar, max_length: 40 },
            { name: 'metadata', data_type: DataType.JSON },
          ],
        });
        await client.createIndex({
          collection_name: this.COLLECTION_NAME,
          field_name: 'vector',
          index_type: IndexType.IVF_FLAT,
          metric_type: MetricType.COSINE,
          params: { nlist: 128 },
        });
      }
      await client.loadCollection({ collection_name: this.COLLECTION_NAME });
    } catch (error) {
      this.logger.warn(`Memory vector collection is unavailable: ${String(error)}`);
    }
  }

  private async persistMemory(memory: MemoryEntry): Promise<void> {
    await this.memoryEntryRepo.save(memory);
    if (memory.level === MemoryLevel.LONG_TERM) {
      await this.storeToMilvus(memory);
    }
  }

  private async storeToMilvus(memory: MemoryEntry): Promise<void> {
    try {
      const vector = await this.embeddings.embedQuery(memory.content);
      memory.vector = vector;

      await this.milvusService.getClient().upsert({
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
          updated_at: memory.updatedAt,
          metadata: memory.metadata,
        }],
      });
    } catch (error) {
      this.logger.error(`Failed to store memory to Milvus: ${error}`);
    }
  }
}
