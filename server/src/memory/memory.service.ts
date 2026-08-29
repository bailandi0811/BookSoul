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
import { requireSafePathSegment } from '../auth/auth-context';
import { withTimeout } from '../common/promise-timeout';

export interface AgentMemoryContext {
  text: string;
  recalledMemoryIds: string[];
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly embeddings: OpenAIEmbeddings;
  private readonly model: ChatOpenAI;
  private readonly COLLECTION_NAME = 'memory_embeddings';
  private readonly MEMORY_GATE_THRESHOLD = 0.7;
  private readonly openAiRequestTimeoutMs: number;
  private readonly milvusRequestTimeoutMs: number;

  constructor(
    private configService: ConfigService,
    private milvusService: MilvusService,
    private userProfileRepo: UserProfileRepository,
    private memoryEntryRepo: MemoryEntryRepository,
    private importanceScorer: ImportanceScorerStrategy,
  ) {
    this.openAiRequestTimeoutMs =
      this.configService.get<number>('openai.requestTimeoutMs') || 20_000;
    this.milvusRequestTimeoutMs =
      this.configService.get<number>('milvus.requestTimeoutMs') || 8_000;

    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('openai.apiKey'),
      model: this.configService.get<string>('openai.embeddingModel'),
      configuration: {
        baseURL: this.configService.get<string>('openai.baseUrl'),
      },
      dimensions: this.configService.get<number>('milvus.vectorDim'),
      timeout: this.openAiRequestTimeoutMs,
      maxRetries: 1,
    });

    this.model = new ChatOpenAI({
      temperature: 0.7,
      apiKey: this.configService.get<string>('openai.apiKey'),
      model: this.configService.get<string>('openai.chatModel'),
      configuration: {
        baseURL: this.configService.get<string>('openai.baseUrl'),
      },
      timeout: this.openAiRequestTimeoutMs,
      maxRetries: 1,
    });
  }

  async onModuleInit() {
    await this.ensureCollection();
  }

  // ========== User Profile ==========

  async getOrCreateUserProfile(
    userId: string,
    sessionId: string,
  ): Promise<UserProfile> {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(sessionId, '会话标识');
    const [current, profiles] = await Promise.all([
      this.userProfileRepo.get(userId, sessionId),
      this.userProfileRepo.getByUserId(userId),
    ]);
    const merged = this.mergeProfiles(userId, sessionId, profiles);

    if (!current) {
      await this.userProfileRepo.save(merged);
      return merged;
    }
    return {
      ...merged,
      sessionId,
      createdAt: current.createdAt,
      updatedAt:
        new Date(merged.updatedAt) > new Date(current.updatedAt)
          ? merged.updatedAt
          : current.updatedAt,
    };
  }

  async updateUserProfile(
    userId: string,
    sessionId: string,
    updates: Partial<UserProfile>,
  ): Promise<UserProfile> {
    const current = await this.getOrCreateUserProfile(userId, sessionId);
    return this.userProfileRepo.update(userId, sessionId, {
      preferences: updates.preferences
        ? { ...current.preferences, ...updates.preferences }
        : current.preferences,
      facts: updates.facts
        ? { ...current.facts, ...updates.facts }
        : current.facts,
      summary: updates.summary ?? current.summary,
    });
  }

  async extractAndUpdateProfile(
    userId: string,
    sessionId: string,
    messages: string[],
  ): Promise<UserProfile> {
    if (messages.length === 0) {
      return this.getOrCreateUserProfile(userId, sessionId);
    }

    const extractionPrompt = `你是一个用户信息提取助手。请从以下对话中提取用户的事实信息。

【规则】
1. 只提取明确陈述的事实，不要推测
2. 返回 JSON 格式
3. 可能的字段：name, gender, location, occupation, interests, favoriteCharacters

【对话】
${messages.map((m) => `- ${m}`).join('\n')}

【输出格式】
{
  "facts": {"姓名": "...", "性别": "...", ...},
  "interests": ["武侠", "历史", ...],
  "preferences": {"favoriteCharacters": ["乔峰", ...]},
  "summary": "用户是一个..."
}`;

    try {
      const response = await this.model.invoke([
        new HumanMessage(extractionPrompt),
      ]);
      const extracted = JSON.parse(response.content as string);

      const profile = await this.getOrCreateUserProfile(userId, sessionId);
      const updated = await this.userProfileRepo.update(userId, sessionId, {
        facts: { ...profile.facts, ...extracted.facts },
        preferences: {
          favoriteCharacters:
            extracted.preferences?.favoriteCharacters ||
            profile.preferences.favoriteCharacters,
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

  async scoreImportance(
    message: string,
    context: string[] = [],
  ): Promise<ImportanceScore> {
    return this.importanceScorer.score(message, context);
  }

  async processAndStoreMemory(
    userId: string,
    sessionId: string,
    message: string,
  ): Promise<MemoryUpdateEvent> {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(sessionId, '会话标识');
    const importanceScore = await this.scoreImportance(message);
    const explicitConfirmation = this.isExplicitMemoryRequest(message);
    const category = this.determineCategory(message);

    // Memory Gate: ordinary long messages are not memories.  Only explicit
    // user facts/preferences (or an explicit "remember this") pass.
    if (
      importanceScore.score < this.MEMORY_GATE_THRESHOLD ||
      importanceScore.suggestedLevel !== MemoryLevel.LONG_TERM ||
      (category === MemoryCategory.OTHER && !explicitConfirmation)
    ) {
      return { hasNewMemories: false, memoryCount: 0 };
    }

    const content = (importanceScore.extractContent || message).trim();
    const normalizedContent = this.normalizeMemoryContent(content);
    const existingMemories = await this.memoryEntryRepo.getByUserId(userId);
    const duplicate = existingMemories.find(
      (entry) =>
        entry.category === category &&
        this.normalizeMemoryContent(entry.content) === normalizedContent,
    );
    if (duplicate) {
      const now = new Date().toISOString();
      const updated = await this.memoryEntryRepo.update(duplicate.id, userId, {
        importance: Math.max(duplicate.importance, importanceScore.score),
        metadata: {
          ...duplicate.metadata,
          verified: duplicate.metadata.verified || explicitConfirmation,
          occurrences: (duplicate.metadata.occurrences ?? 1) + 1,
          lastSeenAt: now,
          sourceSessionIds: [
            ...new Set([
              ...(duplicate.metadata.sourceSessionIds ?? [duplicate.sessionId]),
              sessionId,
            ]),
          ],
        },
      });
      if (updated?.level === MemoryLevel.LONG_TERM) {
        await this.storeToMilvus(updated);
      }
      return {
        hasNewMemories: false,
        memoryCount: 0,
        updatedCount: 1,
        confirmedCount: explicitConfirmation ? 1 : 0,
      };
    }

    const now = new Date().toISOString();
    const memoryEntry: MemoryEntry = {
      id: this.memoryEntryRepo.generateId(),
      userId,
      sessionId,
      level: MemoryLevel.LONG_TERM,
      content,
      importance: importanceScore.score,
      category,
      createdAt: now,
      updatedAt: now,
      metadata: {
        sourceMessage: message,
        extractReason: importanceScore.reasons.join('; '),
        source: 'automatic',
        occurrences: 1,
        lastSeenAt: now,
        sourceSessionIds: [sessionId],
        editable: true,
        verified: explicitConfirmation,
      },
    };

    await this.persistMemory(memoryEntry);

    return {
      hasNewMemories: true,
      memoryCount: 1,
      proposedCount: explicitConfirmation ? 0 : 1,
      confirmedCount: explicitConfirmation ? 1 : 0,
    };
  }

  private determineCategory(message: string): MemoryCategory {
    if (/喜欢|讨厌|偏好|兴趣|以后.*(?:回答|称呼)/.test(message)) {
      return MemoryCategory.PREFERENCE;
    }
    if (/名字|我叫|住在|来自|职业|工作/.test(message)) {
      return MemoryCategory.FACT;
    }
    return MemoryCategory.OTHER;
  }

  private isExplicitMemoryRequest(message: string): boolean {
    return /请记住|记住(?:我|这|以后)|别忘了|下次(?:请|要|记得)/i.test(message);
  }

  private normalizeMemoryContent(content: string): string {
    return content
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s，。！？、；：,.!?;:]+/g, '');
  }

  // ========== Memory CRUD ==========

  async createMemory(
    userId: string,
    input: CreateMemoryDto,
  ): Promise<MemoryEntry> {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(input.sessionId, '会话标识');
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
        source: 'manual',
        occurrences: 1,
        lastSeenAt: now,
        sourceSessionIds: [input.sessionId],
        editable: true,
        verified: true,
        extractReason: '用户手动添加',
      },
    };
    await this.persistMemory(entry);
    return entry;
  }

  async getMemories(
    userId: string,
    sessionId: string,
    level?: MemoryLevel,
  ): Promise<MemoryEntry[]> {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(sessionId, '会话标识');
    const memories = level
      ? await this.memoryEntryRepo.getByLevel(userId, level)
      : await this.memoryEntryRepo.getByUserId(userId);

    // Long-term and semantic memories are account-scoped. Episodic memories
    // stay inside the current conversation.
    return memories.filter(
      (entry) =>
        entry.level !== MemoryLevel.EPISODIC || entry.sessionId === sessionId,
    );
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
    if (updated?.level === MemoryLevel.LONG_TERM) {
      await this.storeToMilvus(updated);
    }
    return updated;
  }

  async deleteMemory(memoryId: string, userId: string): Promise<void> {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(memoryId, '记忆标识');
    const ownedMemory = await this.memoryEntryRepo.getById(memoryId, userId);
    if (!ownedMemory) return;
    await this.memoryEntryRepo.delete(memoryId, userId);
    // 从 Milvus 中也删除
    if (this.milvusService.isAvailable?.() === false) return;
    try {
      await this.milvusService.getClient().delete({
        collection_name: this.COLLECTION_NAME,
        filter: `id == "${memoryId}" && ${this.ownerFilter(userId)}`,
      });
    } catch (e) {
      this.logger.warn(`Failed to delete from Milvus: ${e}`);
    }
  }

  // ========== Semantic Search ==========

  async searchMemories(
    query: string,
    userId: string,
    topK: number = 5,
  ): Promise<MemoryEntry[]> {
    requireSafePathSegment(userId, '用户标识');
    const safeTopK = Math.max(1, Math.min(20, topK));
    if (this.milvusService.isAvailable?.() === false) {
      const all = await this.memoryEntryRepo.getByUserId(userId);
      return this.rankTextMemories(all, query).slice(0, safeTopK);
    }
    try {
      const queryVector = await withTimeout(
        this.embeddings.embedQuery(query),
        this.openAiRequestTimeoutMs,
        'Memory query embedding',
      );
      const results = await withTimeout(
        this.milvusService.getClient().search({
          collection_name: this.COLLECTION_NAME,
          vector: queryVector,
          limit: safeTopK,
          filter: this.ownerFilter(userId),
          metric_type: MetricType.COSINE,
          output_fields: ['*'],
        }),
        this.milvusRequestTimeoutMs,
        'Memory vector search',
      );

      if (!results.results || results.results.length === 0) {
        return [];
      }

      // Keep an application-side ownership check as defense in depth in case a
      // vector-store filter is misconfigured or ignored by a future adapter.
      return results.results
        .filter((record) => record.user_id === userId)
        .map((record) => ({
          id: record.id as string,
          userId: record.user_id as string,
          sessionId: record.session_id as string,
          level: record.level as MemoryLevel,
          content: record.content as string,
          importance: record.importance as number,
          category: record.category as MemoryCategory,
          createdAt: record.created_at as string,
          updatedAt: record.updated_at as string,
          metadata: this.parseMetadata(record.metadata),
        }));
    } catch (error) {
      this.logger.warn(
        `Milvus search failed, falling back to text search: ${error}`,
      );
      const all = await this.memoryEntryRepo.getByUserId(userId);
      return this.rankTextMemories(all, query).slice(0, safeTopK);
    }
  }

  async buildAgentContext(
    userId: string,
    sessionId: string,
    query: string,
    topK = 5,
  ): Promise<AgentMemoryContext> {
    requireSafePathSegment(userId, '用户标识');
    requireSafePathSegment(sessionId, '会话标识');

    const [profiles, allMemories] = await Promise.all([
      this.userProfileRepo.getByUserId(userId),
      this.memoryEntryRepo.getByUserId(userId),
    ]);
    const profile = this.mergeProfiles(userId, sessionId, profiles);
    const stableMemories = allMemories
      .filter((entry) => entry.metadata.verified)
      .sort(
        (a, b) =>
          b.importance - a.importance ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    const semanticMatches = stableMemories.length
      ? await this.searchMemories(query, userId, Math.min(20, topK * 3))
      : [];
    const recalled = [...semanticMatches, ...stableMemories]
      .filter((entry) => entry.userId === userId && entry.metadata.verified)
      .filter(
        (entry, index, entries) =>
          entries.findIndex((candidate) => candidate.id === entry.id) === index,
      )
      .slice(0, topK);

    const sections: string[] = [];
    const profileLines: string[] = [];
    if (profile.summary.trim()) {
      profileLines.push(`画像摘要：${profile.summary.slice(0, 600)}`);
    }
    if (profile.preferences.favoriteCharacters.length) {
      profileLines.push(
        `偏好角色：${profile.preferences.favoriteCharacters.slice(0, 8).join('、')}`,
      );
    }
    if (profile.preferences.interests.length) {
      profileLines.push(
        `兴趣：${profile.preferences.interests.slice(0, 8).join('、')}`,
      );
    }
    const factEntries = Object.entries(profile.facts).slice(0, 8);
    if (factEntries.length) {
      profileLines.push(
        `用户事实：${factEntries.map(([key, value]) => `${key}=${value}`).join('；')}`,
      );
    }
    if (profileLines.length) sections.push(profileLines.join('\n'));
    if (recalled.length) {
      sections.push(
        recalled
          .map(
            (entry, index) =>
              `${index + 1}. [${entry.category}] ${entry.content.slice(0, 500)}`,
          )
          .join('\n'),
      );
    }

    return {
      text: sections.join('\n\n'),
      recalledMemoryIds: recalled.map((entry) => entry.id),
    };
  }

  private mergeProfiles(
    userId: string,
    sessionId: string,
    profiles: UserProfile[],
  ): UserProfile {
    const merged = this.userProfileRepo.createDefault(userId, sessionId);
    if (!profiles.length) return merged;

    const favoriteCharacters = new Set<string>();
    const interests = new Set<string>();
    let createdAt = profiles[0].createdAt;
    let updatedAt = profiles[0].updatedAt;

    for (const profile of profiles) {
      profile.preferences.favoriteCharacters.forEach((value) =>
        favoriteCharacters.add(value),
      );
      profile.preferences.interests.forEach((value) => interests.add(value));
      if (profile.preferences.location) {
        merged.preferences.location = profile.preferences.location;
      }
      Object.assign(merged.facts, profile.facts);
      if (profile.summary.trim()) merged.summary = profile.summary;
      if (new Date(profile.createdAt) < new Date(createdAt)) {
        createdAt = profile.createdAt;
      }
      if (new Date(profile.updatedAt) > new Date(updatedAt)) {
        updatedAt = profile.updatedAt;
      }
    }

    merged.preferences.favoriteCharacters = [...favoriteCharacters];
    merged.preferences.interests = [...interests];
    merged.createdAt = createdAt;
    merged.updatedAt = updatedAt;
    return merged;
  }

  private rankTextMemories(
    memories: MemoryEntry[],
    query: string,
  ): MemoryEntry[] {
    const normalizedQuery = this.normalizeMemoryContent(query);
    const queryUnits = new Set(
      normalizedQuery.length > 1
        ? Array.from({ length: normalizedQuery.length - 1 }, (_, index) =>
            normalizedQuery.slice(index, index + 2),
          )
        : [normalizedQuery],
    );

    return memories
      .map((entry) => {
        const content = this.normalizeMemoryContent(entry.content);
        let relevance = content.includes(normalizedQuery) ? 10 : 0;
        for (const unit of queryUnits) {
          if (unit && content.includes(unit)) relevance += 1;
        }
        return { entry, relevance };
      })
      .filter(({ relevance }) => relevance > 0)
      .sort(
        (a, b) =>
          b.relevance - a.relevance ||
          b.entry.importance - a.entry.importance ||
          new Date(b.entry.updatedAt).getTime() -
            new Date(a.entry.updatedAt).getTime(),
      )
      .map(({ entry }) => entry);
  }

  private parseMetadata(value: unknown): MemoryEntry['metadata'] {
    const parsed =
      typeof value === 'string'
        ? (JSON.parse(value) as MemoryEntry['metadata'])
        : (value as MemoryEntry['metadata']);
    return {
      ...parsed,
      editable: parsed?.editable ?? true,
      verified: parsed?.verified ?? false,
    };
  }

  private ownerFilter(userId: string): string {
    requireSafePathSegment(userId, '用户标识');
    return `user_id == "${userId}"`;
  }

  // ========== Milvus Integration ==========

  private async ensureCollection(): Promise<void> {
    if (this.milvusService.isAvailable?.() === false) {
      this.logger.warn('Memory vector collection skipped: Milvus unavailable');
      return;
    }
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
            {
              name: 'session_id',
              data_type: DataType.VarChar,
              max_length: 128,
            },
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
      this.logger.warn(
        `Memory vector collection is unavailable: ${String(error)}`,
      );
    }
  }

  private async persistMemory(memory: MemoryEntry): Promise<void> {
    await this.memoryEntryRepo.save(memory);
    if (memory.level === MemoryLevel.LONG_TERM) {
      await this.storeToMilvus(memory);
    }
  }

  private async storeToMilvus(memory: MemoryEntry): Promise<void> {
    if (this.milvusService.isAvailable?.() === false) {
      this.logger.warn('Memory vector write skipped: Milvus unavailable');
      return;
    }
    try {
      const vector = await withTimeout(
        this.embeddings.embedQuery(memory.content),
        this.openAiRequestTimeoutMs,
        'Memory embedding',
      );
      memory.vector = vector;

      await withTimeout(
        this.milvusService.getClient().upsert({
          collection_name: this.COLLECTION_NAME,
          data: [
            {
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
            },
          ],
        }),
        this.milvusRequestTimeoutMs,
        'Memory vector write',
      );
    } catch (error) {
      this.logger.error(`Failed to store memory to Milvus: ${error}`);
    }
  }
}
