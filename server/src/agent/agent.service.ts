import { ForbiddenException, HttpException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { MilvusService } from '../milvus/milvus.service';
import { McpService } from '../mcp/mcp.service';
import { PersonaService } from '../persona/persona.service';
import { MemoryService } from '../memory/memory.service';
import {
  createClassifyNode,
  createDirectGeneratorNode,
  createQueryRewriterNode,
  createCritiqueNode,
  createGeneratorNode,
  createHybridGeneratorNode,
} from './nodes';
import { AgentState } from './state';
import { MetricType } from '@zilliz/milvus2-sdk-node';
import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import { requireSafePathSegment, resolveWithinRoot } from '../auth/auth-context';

interface QueryAnalysis {
  type: 'simple' | 'compare' | 'multi_hop' | 'broad';
  rewritten_query: string;
  sub_questions: string[];
  top_k: number;
  reasoning: string;
}

interface StoredHistoryMessage {
  type: 'human' | 'ai' | 'system' | 'tool';
  data: {
    content: unknown;
    tool_calls?: unknown[];
  };
}

@Injectable()
export class AgentService implements OnModuleInit {
  private model: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;
  private readonly logger = new Logger(AgentService.name);
  private embeddingCache = new Map<string, { vector: number[]; ts: number }>();
  private readonly EMBEDDING_CACHE_TTL_MS = 10 * 60 * 1000;
  private readonly EMBEDDING_CACHE_MAX_SIZE = 200;
  private readonly historyLocks = new Map<string, Promise<void>>();

  constructor(
    private configService: ConfigService,
    private milvusService: MilvusService,
    private mcpService: McpService,
    private personaService: PersonaService,
    private memoryService: MemoryService,
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
      streaming: true,
    });
  }

  async onModuleInit() {
    this.logger.log('AgentService initialized');
  }

  private async embedQuery(query: string): Promise<number[]> {
    const normalized = query.trim().toLowerCase();
    const now = Date.now();
    const cached = this.embeddingCache.get(normalized);
    if (cached && now - cached.ts < this.EMBEDDING_CACHE_TTL_MS) {
      return cached.vector;
    }

    const vector = await this.embeddings.embedQuery(query);
    this.embeddingCache.set(normalized, { vector, ts: now });

    // 简单淘汰策略：超过上限时删除最早插入的一项
    if (this.embeddingCache.size > this.EMBEDDING_CACHE_MAX_SIZE) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }

    return vector;
  }

  private async searchNovel(query: string, topK: number): Promise<any[]> {
    try {
      const queryVector = await this.embedQuery(query);
      const searchResult = await this.milvusService.getClient().search({
        collection_name: this.configService.get<string>('milvus.collectionName') || 'ebook',
        vector: queryVector,
        limit: topK,
        metric_type: MetricType.COSINE,
        output_fields: ['content', 'chapter_num', 'book_name'],
      });
      return searchResult.results || [];
    } catch (error: any) {
      this.logger.error('Vector search failed:', error);
      return [];
    }
  }

  private async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const queryRewriter = createQueryRewriterNode(this.model);
    const state = {
      query,
      persona: 'assistant',
      intent_classification: null,
      rewritten_queries: [] as string[],
      current_query_index: 0,
      retrieved_documents: [] as any[],
      critique: null,
      retry_count: 0,
      max_retries: 2,
      final_response: '',
      references: [] as any[],
      has_used_rag: false,
      messages: [] as any[],
      next_action: 'rewrite' as const,
      tool_calls: [] as any[],
    };
    const result = await queryRewriter(state);
    return {
      type: 'simple',
      rewritten_query: (result.rewritten_queries && result.rewritten_queries[0]) || query,
      sub_questions: result.rewritten_queries || [],
      top_k: (result.rewritten_queries && result.rewritten_queries.length > 2) ? 6 : 3,
      reasoning: 'Default reasoning',
    };
  }

  private formatContext(docs: any[]): string {
    return docs
      .map((doc, i) =>
        `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`
      )
      .join('\n\n');
  }

  private extractTextFromContentArray(content: any[]): string {
    let text = '';
    for (const item of content) {
      if (!item) continue;
      if (typeof item === 'string') {
        text += item;
        continue;
      }
      if (typeof item.text === 'string') {
        text += item.text;
        continue;
      }
      if (typeof item.text?.value === 'string') {
        text += item.text.value;
        continue;
      }
      if (typeof item.value === 'string') {
        text += item.value;
        continue;
      }
      if (typeof item.content === 'string') {
        text += item.content;
        continue;
      }
      if (Array.isArray(item.content)) {
        text += this.extractTextFromContentArray(item.content);
      }
    }
    return text;
  }

  private extractTextFromChunk(chunk: any): string {
    if (!chunk) return '';

    if (typeof chunk === 'string') return chunk;
    if (typeof chunk.content === 'string') return chunk.content;
    if (Array.isArray(chunk.content)) return this.extractTextFromContentArray(chunk.content);
    if (typeof chunk.text === 'string') return chunk.text;
    if (typeof chunk.delta?.text === 'string') return chunk.delta.text;
    if (typeof chunk.delta?.content === 'string') return chunk.delta.content;
    if (typeof chunk.message?.content === 'string') return chunk.message.content;
    if (Array.isArray(chunk.message?.content)) {
      return this.extractTextFromContentArray(chunk.message.content);
    }
    if (typeof chunk.kwargs?.content === 'string') return chunk.kwargs.content;
    if (Array.isArray(chunk.kwargs?.content)) {
      return this.extractTextFromContentArray(chunk.kwargs.content);
    }
    if (Array.isArray(chunk.choices)) {
      let text = '';
      for (const choice of chunk.choices) {
        if (typeof choice?.delta?.content === 'string') {
          text += choice.delta.content;
        } else if (Array.isArray(choice?.delta?.content)) {
          text += this.extractTextFromContentArray(choice.delta.content);
        } else if (typeof choice?.message?.content === 'string') {
          text += choice.message.content;
        } else if (Array.isArray(choice?.message?.content)) {
          text += this.extractTextFromContentArray(choice.message.content);
        }
      }
      return text;
    }

    return '';
  }

  private createSearchNovelExpertTool(onProgress?: (msg: string) => void) {
    return tool(
      async ({ search_query }) => {
        this.logger.log(`[Deep Search Tool] Triggered with query: ${search_query}`);
        if (onProgress) onProgress(`正在分析检索意图：${search_query}`);

        const MAX_RETRIES = 2;
        let retryCount = 0;
        let allDocs: any[] = [];

        try {
          // 1. Query Analysis
          const analysis = await this.analyzeQuery(search_query);
          const queries = analysis.sub_questions.length > 0 ? analysis.sub_questions : [search_query];

          // 2. Initial Retrieve
          if (onProgress) onProgress(`正在数据库中检索小说片段...`);
          for (const q of queries) {
            const topK = queries.length > 1 ? Math.min(6, analysis.top_k) : analysis.top_k;
            const docs = await this.searchNovel(q, topK);
            allDocs.push(...docs);
          }

          // 3. Simple critique - if we have docs, assume adequate
          const is_adequate = allDocs.length > 0;
          const confidence = allDocs.length > 2 ? 0.8 : allDocs.length > 0 ? 0.6 : 0.3;

          // 4. Retry if not adequate
          while (!is_adequate && retryCount < MAX_RETRIES) {
            retryCount++;
            this.logger.log(`[Deep Search Tool] Retrieval not adequate, retry ${retryCount}/${MAX_RETRIES}`);
            if (onProgress) onProgress(`检索结果不足，正在进行第 ${retryCount} 次重试扩充...`);

            const newDocs = await this.searchNovel(search_query, analysis.top_k + 2);

            if (newDocs.length > 0) {
              allDocs = newDocs;
            }
          }

          if (onProgress) onProgress(`检索与校验完成，准备生成回答...`);

          const context = this.formatContext(allDocs);
          return `【系统通知】已为你检索小说数据库。\n【评估结果】信心指数: ${confidence}\n【检索内容】\n${context || '未找到相关内容'}`;
        } catch (err: any) {
          this.logger.error(`Error in searchNovelExpertTool: ${err.message}`);
          if (onProgress) onProgress(`搜索发生错误，正在切换降级方案...`);
          return `搜索小说内容时发生错误: ${err.message}`;
        }
      },
      {
        name: 'search_novel_expert',
        description: '可选工具：当用户询问关于《天龙八部》小说的具体情节、人物细节、武功招式、地点等，且你不确定准确答案时，使用此工具进行检索。对于你可以直接回答的简单问题、普通问候或闲聊，无需调用。不要查询与小说无关的现实世界信息。',
        schema: z.object({
          search_query: z.string().describe('需要检索的具体小说相关问题，请尽量精简明确。'),
        }),
      }
    );
  }

  // ========== RAG Node Implementations ==========

  private createRetrieverNodeForRAG(_searchTool: any, baseTopK = 2) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
      const pendingQueries = state.rewritten_queries
        .slice(state.current_query_index)
        .filter((q) => typeof q === 'string' && q.trim().length > 0);

      if (pendingQueries.length === 0) {
        return { next_action: 'critique' as const };
      }

      const topK = state.rewritten_queries.length > 1
        ? Math.min(4, baseTopK + state.rewritten_queries.length)
        : baseTopK;

      try {
        // 并行检索所有待处理子问题，降低复杂问题总耗时
        const results = await Promise.all(
          pendingQueries.map(async (q) => {
            try {
              const docs = await this.searchNovel(q, topK);
              return { query: q, docs };
            } catch {
              return { query: q, docs: [] };
            }
          }),
        );

        const mergedResults = [...state.retrieved_documents, ...results];

        return {
          retrieved_documents: mergedResults,
          current_query_index: state.rewritten_queries.length,
          next_action: 'critique' as const,
        };
      } catch {
        const failedResults = pendingQueries.map((q) => ({ query: q, docs: [] }));
        return {
          retrieved_documents: [...state.retrieved_documents, ...failedResults],
          current_query_index: state.rewritten_queries.length,
          next_action: 'critique' as const,
        };
      }
    };
  }

  async *streamChat(
    query: string,
    persona: string = 'assistant',
    sessionId: string = 'default_session',
    userId: string = 'anonymous',
    abortSignal?: AbortSignal,
  ): AsyncGenerator<{ type: string; data: any }> {
    let allFoundReferences: any[] = [];
    const requestStartedAt = Date.now();
    const stageDurations = new Map<string, number>();
    const stageCounts = new Map<string, number>();
    let firstTokenLatencyMs: number | null = null;

    const recordStageTiming = (stage: string, durationMs: number) => {
      stageDurations.set(stage, (stageDurations.get(stage) || 0) + durationMs);
      stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
      this.logger.log(`[Timing] stage=${stage} duration=${durationMs}ms`);
    };

    try {
      // ========== Create Node Instances ==========

      const classifyNode = createClassifyNode(this.model);
      const directGeneratorNode = createDirectGeneratorNode(this.model, this.personaService.getPersonaPrompt.bind(this.personaService));
      const queryRewriterNode = createQueryRewriterNode(this.model);
      const critiqueNode = createCritiqueNode(this.model);

      let searchNovelTool: any | null = null;
      let retrieverNode: any | null = null;
      let generatorNode: any | null = null;
      let hybridGeneratorNode: any | null = null;

      const ensureRetrieverNode = () => {
        if (!searchNovelTool) {
          searchNovelTool = this.createSearchNovelExpertTool((msg) => {
            this.logger.log(`[Search Progress] ${msg}`);
          });
        }
        if (!retrieverNode) {
          retrieverNode = this.createRetrieverNodeForRAG(searchNovelTool);
        }
      };

      const ensureGenerationNodes = async () => {
        if (generatorNode && hybridGeneratorNode) return;
        const toolIntentPattern = /位置|定位|地图|导航|路线|附近|高德|amap/i;
        const enableTools = toolIntentPattern.test(query);
        let tools: any[] = [];

        if (enableTools) {
          if (!searchNovelTool) {
            searchNovelTool = this.createSearchNovelExpertTool((msg) => {
              this.logger.log(`[Search Progress] ${msg}`);
            });
          }
          const mcpTools = await this.mcpService.getMcpTools();
          tools = [searchNovelTool, ...mcpTools];
        }

        generatorNode = createGeneratorNode(this.model, tools, this.personaService.getPersonaPrompt.bind(this.personaService));
        hybridGeneratorNode = createHybridGeneratorNode(this.model, tools, this.personaService.getPersonaPrompt.bind(this.personaService));
      };

      // ========== Build State Machine ==========

      // Simple state machine using async iteration
      let currentState: AgentState = {
        query,
        persona,
        intent_classification: null,
        rewritten_queries: [],
        current_query_index: 0,
        retrieved_documents: [],
        critique: null,
        retry_count: 0,
        max_retries: 1,
        final_response: '',
        references: [],
        has_used_rag: false,
        tool_calls: [],
        messages: [],
        next_action: 'classify',
      };

      // Execute state machine
      let loopCount = 0;
      const maxLoops = 8; // Prevent long thinking loops

      while (currentState.next_action !== 'done' && loopCount < maxLoops) {
        loopCount++;

        if (abortSignal?.aborted) {
          this.logger.log('Agent stream aborted by client');
          break;
        }

        try {
          const stageName = currentState.next_action;
          const stageStart = Date.now();
          switch (currentState.next_action) {
            case 'classify':
              const classifyResult = await classifyNode(currentState);
              currentState = { ...currentState, ...classifyResult } as AgentState;

              // Emit intent classification
              if (currentState.intent_classification) {
                yield { type: 'intent', data: currentState.intent_classification };
              }
              break;

            case 'direct_generate':
              const directResult = await directGeneratorNode(currentState);
              if ((directResult as any).stream) {
                for await (const chunk of (directResult as any).stream) {
                  const chunkText = this.extractTextFromChunk(chunk);
                  if (chunkText) {
                    if (firstTokenLatencyMs === null) {
                      firstTokenLatencyMs = Date.now() - requestStartedAt;
                    }
                    currentState.final_response += chunkText;
                    yield { type: 'content', data: chunkText };
                  }
                }
              } else if (directResult.final_response) {
                if (firstTokenLatencyMs === null) {
                  firstTokenLatencyMs = Date.now() - requestStartedAt;
                }
                currentState.final_response += directResult.final_response;
                yield { type: 'content', data: directResult.final_response };
              }
              currentState = { ...currentState, ...directResult, final_response: currentState.final_response || directResult.final_response || '' } as AgentState;
              break;

            case 'rewrite':
              yield { type: 'thinking', data: '正在改写查询...' };
              const rewriteResult = await queryRewriterNode(currentState);
              currentState = { ...currentState, ...rewriteResult } as AgentState;
              break;

            case 'retrieve':
              yield { type: 'thinking', data: '正在检索小说片段...' };
              ensureRetrieverNode();
              const retrieveResult = await retrieverNode(currentState);
              currentState = { ...currentState, ...retrieveResult } as AgentState;
              break;

            case 'critique':
              yield { type: 'thinking', data: '正在评估检索结果...' };
              const critiqueResult = await critiqueNode(currentState);
              currentState = { ...currentState, ...critiqueResult } as AgentState;

              // Emit critique result
              if (currentState.critique) {
                yield { type: 'critique', data: currentState.critique };
              }
              break;

            case 'generate':
              yield { type: 'thinking', data: '正在综合生成回答...' };
              await ensureGenerationNodes();
              const generateResult = await generatorNode(currentState);
              
              if (generateResult.references && generateResult.references.length > 0) {
                allFoundReferences = generateResult.references;
                yield { type: 'references', data: allFoundReferences };
              }

              if ((generateResult as any).stream) {
                for await (const chunk of (generateResult as any).stream) {
                  const chunkText = this.extractTextFromChunk(chunk);
                  if (chunkText) {
                    if (firstTokenLatencyMs === null) {
                      firstTokenLatencyMs = Date.now() - requestStartedAt;
                    }
                    currentState.final_response += chunkText;
                    yield { type: 'content', data: chunkText };
                  }
                }
              } else if (generateResult.final_response) {
                if (firstTokenLatencyMs === null) {
                  firstTokenLatencyMs = Date.now() - requestStartedAt;
                }
                currentState.final_response += generateResult.final_response;
                yield { type: 'content', data: generateResult.final_response };
              }

              currentState = { ...currentState, ...generateResult, final_response: currentState.final_response || generateResult.final_response || '' } as AgentState;
              break;

            case 'hybrid_generate':
              yield { type: 'thinking', data: '混合模式生成中...' };
              await ensureGenerationNodes();
              const hybridResult = await hybridGeneratorNode(currentState);
              
              if (hybridResult.references && hybridResult.references.length > 0) {
                allFoundReferences = hybridResult.references;
                yield { type: 'references', data: allFoundReferences };
              }

              if ((hybridResult as any).stream) {
                for await (const chunk of (hybridResult as any).stream) {
                  const chunkText = this.extractTextFromChunk(chunk);
                  if (chunkText) {
                    if (firstTokenLatencyMs === null) {
                      firstTokenLatencyMs = Date.now() - requestStartedAt;
                    }
                    currentState.final_response += chunkText;
                    yield { type: 'content', data: chunkText };
                  }
                }
              } else if (hybridResult.final_response) {
                if (firstTokenLatencyMs === null) {
                  firstTokenLatencyMs = Date.now() - requestStartedAt;
                }
                currentState.final_response += hybridResult.final_response;
                yield { type: 'content', data: hybridResult.final_response };
              }

              currentState = { ...currentState, ...hybridResult, final_response: currentState.final_response || hybridResult.final_response || '' } as AgentState;
              break;

            default:
              this.logger.warn(`Unknown next_action: ${currentState.next_action}`);
              currentState.next_action = 'done';
          }
          recordStageTiming(stageName, Date.now() - stageStart);
        } catch (error: any) {
          this.logger.error(`Error in state ${currentState.next_action}: ${error.message}`);
          currentState.final_response = `处理出错: ${error.message}`;
          currentState.next_action = 'done';
          yield { type: 'content', data: currentState.final_response };
        }
      }

      // ========== Stream the Final Response ==========

      // Content has already been yielded during generation nodes.
      if (!abortSignal?.aborted && !currentState.final_response.trim()) {
        const fallbackText = '抱歉，我刚才没有成功生成回答。请重试一次，或换个问法。';
        currentState.final_response = fallbackText;
        yield { type: 'content', data: fallbackText };
      }
      
      yield { type: 'has_used_rag', data: currentState.has_used_rag };
      const timingSummary = Array.from(stageDurations.entries())
        .map(([stage, total]) => `${stage}=${total}ms/${stageCounts.get(stage) || 0}次`)
        .join(', ');
      const totalDurationMs = Date.now() - requestStartedAt;
      this.logger.log(
        `[Timing Summary] total=${totalDurationMs}ms, first_token=${firstTokenLatencyMs ?? -1}ms, ${timingSummary}`,
      );
      yield {
        type: 'metrics',
        data: {
          total_ms: totalDurationMs,
          first_token_ms: firstTokenLatencyMs,
          stages: Object.fromEntries(stageDurations),
        },
      };

      // ========== History Management ==========

      if (!abortSignal?.aborted) {
        await this.persistHistory(
          sessionId,
          userId,
          query,
          currentState.final_response || '',
        );

        try {
          const memoryUpdate = await this.memoryService.processAndStoreMemory(
            userId,
            sessionId,
            query,
          );
          if (memoryUpdate.hasNewMemories) {
            yield { type: 'memory_update', data: memoryUpdate };
          }
        } catch (error) {
          this.logger.warn(`Failed to process memory: ${String(error)}`);
        }
      }

    } catch (error: any) {
      this.logger.error('Agent stream error:', error);
      yield { type: 'error', data: error.message };
    }
  }

  async chat(query: string, persona: string = 'assistant', sessionId: string = 'default_session', userId: string = 'anonymous'): Promise<{
    response: string;
    references: any[];
  }> {
    let response = '';
    let references: any[] = [];

    for await (const event of this.streamChat(query, persona, sessionId, userId)) {
      if (event.type === 'content' || event.type === 'final') {
        response += event.data;
      }
      if (event.type === 'references') {
        references = event.data;
      }
    }

    return { response, references };
  }

  private async persistHistory(
    sessionId: string,
    userId: string,
    query: string,
    response: string,
  ): Promise<void> {
    await this.withHistoryLock(sessionId, async () => {
      const historyFilePath = this.getHistoryFilePath(sessionId);
      const historyDir = path.dirname(historyFilePath);
      fs.mkdirSync(historyDir, { recursive: true });

      let oldMessages: StoredHistoryMessage[] = [];
      if (fs.existsSync(historyFilePath)) {
        const stored = JSON.parse(fs.readFileSync(historyFilePath, 'utf-8'));
        const session = stored['']?.[sessionId];
        if (session?.userId !== userId) {
          throw new ForbiddenException('无权写入该会话');
        }
        oldMessages = Array.isArray(session.messages) ? session.messages : [];
      }

      const summaryPrefix = '【历史对话摘要】\n';
      const summaryMessage = oldMessages.find(
        (message) =>
          message.type === 'system' &&
          typeof message.data?.content === 'string' &&
          message.data.content.startsWith(summaryPrefix),
      );
      const existingSummary =
        typeof summaryMessage?.data.content === 'string'
          ? summaryMessage.data.content.slice(summaryPrefix.length)
          : '';
      let conversationMessages = oldMessages.filter(
        (message) =>
          message !== summaryMessage &&
          message.type !== 'tool' &&
          !(message.type === 'ai' && (message.data.tool_calls?.length ?? 0) > 0),
      );

      const userMessage: StoredHistoryMessage = {
        type: 'human',
        data: { content: query },
      };
      const assistantMessage: StoredHistoryMessage = {
        type: 'ai',
        data: { content: response },
      };
      let nextMessages = [...oldMessages, userMessage, assistantMessage];

      const maxWindowSize = 10;
      const summaryTriggerThreshold = 14;
      if (conversationMessages.length >= summaryTriggerThreshold) {
        const summarizeCount = conversationMessages.length - maxWindowSize;
        const messagesToSummarize = conversationMessages.slice(0, summarizeCount);
        conversationMessages = conversationMessages.slice(summarizeCount);
        const formattedMessages = messagesToSummarize
          .map((message) =>
            `${message.type === 'human' ? 'User' : 'Assistant'}: ${String(message.data.content ?? '')}`,
          )
          .join('\n');
        const summaryPrompt = `你是一个有用的AI助手。请根据以下先前的对话摘要（如果有）和新的对话记录，生成一个简短且连贯的更新版对话摘要。请保留重要的事实、偏好和上下文信息。只返回摘要文本，不要有任何其他多余的解释。

之前的摘要：
${existingSummary || '无'}

新的对话记录：
${formattedMessages}`;

        try {
          const summaryResponse = await this.model.invoke([
            new HumanMessage(summaryPrompt),
          ]);
          const newSummary = this.extractTextFromChunk(summaryResponse);
          nextMessages = [
            {
              type: 'system',
              data: { content: `${summaryPrefix}${newSummary}` },
            },
            ...conversationMessages,
            userMessage,
            assistantMessage,
          ];
        } catch (error) {
          this.logger.error('Failed to generate history summary', error);
        }
      }

      const serialized = JSON.stringify(
        { '': { [sessionId]: { messages: nextMessages, userId } } },
        null,
        2,
      );
      const temporaryPath = `${historyFilePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temporaryPath, serialized, 'utf-8');
      fs.renameSync(temporaryPath, historyFilePath);
    });
  }

  private async withHistoryLock<T>(
    sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.historyLocks.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => gate);
    this.historyLocks.set(sessionId, queued);
    await previous;

    try {
      return await task();
    } finally {
      release();
      if (this.historyLocks.get(sessionId) === queued) {
        this.historyLocks.delete(sessionId);
      }
    }
  }

  async getHistoryList(userId: string): Promise<{ sessionId: string; title: string; updatedAt: number }[]> {
    const historyDir = path.join(process.cwd(), 'chat_histories');
    if (!fs.existsSync(historyDir)) return [];

    const list: { sessionId: string; title: string; updatedAt: number }[] = [];

    try {
      const files = fs.readdirSync(historyDir).filter(f => f.startsWith('session_') && f.endsWith('.json'));

      for (const file of files) {
        const historyFilePath = path.join(historyDir, file);
        const sessionId = file.replace('session_', '').replace('.json', '');

        try {
          const content = fs.readFileSync(historyFilePath, 'utf-8');
          const data = JSON.parse(content);
          const sessionData = data['']?.[sessionId] || {};
          if (sessionData.userId !== userId) continue;
          const messages = sessionData.messages || [];

          let title = '新对话';
          if (Array.isArray(messages) && messages.length > 0) {
            const firstHumanMsg = messages.find((m: any) => m.type === 'human');
            if (firstHumanMsg && firstHumanMsg.data && firstHumanMsg.data.content) {
              title = firstHumanMsg.data.content.substring(0, 20) + (firstHumanMsg.data.content.length > 20 ? '...' : '');
            } else {
              const firstMsg = messages[0];
              if (firstMsg && firstMsg.data && firstMsg.data.content) {
                title = firstMsg.data.content.substring(0, 20) + (firstMsg.data.content.length > 20 ? '...' : '');
              }
            }
          }

          let updatedAt = fs.statSync(historyFilePath).mtimeMs;
          const timeMatch = sessionId.match(/(\d+)/);
          if (timeMatch && timeMatch[1]) {
            updatedAt = parseInt(timeMatch[1], 10);
          }

          list.push({ sessionId, title, updatedAt });
        } catch (e) {
          this.logger.error(`Error reading history file ${file}:`, e);
        }
      }
    } catch (error) {
      this.logger.error(`Error listing history directory:`, error);
    }

    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getSessionHistory(sessionId: string, userId: string): Promise<any[]> {
    const historyFilePath = this.getHistoryFilePath(sessionId);
    const targetFilePath = fs.existsSync(historyFilePath) ? historyFilePath : null;

    if (!targetFilePath) return [];

    try {
      const content = fs.readFileSync(targetFilePath, 'utf-8');
      const data = JSON.parse(content);
      const sessionData = data['']?.[sessionId];
      if (!sessionData) return [];
      if (sessionData.userId !== userId) {
        throw new ForbiddenException('无权访问该会话');
      }
      const rawMessages = sessionData.messages || [];

      const messages: any[] = [];
      for (const msg of rawMessages) {
        if (!msg.type || !msg.data) continue;

        if (msg.type === 'human') {
          messages.push({ role: 'user', content: msg.data.content });
        } else if (msg.type === 'ai' && msg.data.content) {
          if (typeof msg.data.content === 'string' && msg.data.content.trim().length > 0) {
            messages.push({ role: 'assistant', content: msg.data.content });
          }
        } else if (msg.type === 'system' && typeof msg.data.content === 'string' && msg.data.content.startsWith('【历史对话摘要】')) {
          messages.push({ role: 'assistant', content: `*${msg.data.content}*` });
        }
      }
      return messages;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error parsing session history ${sessionId}:`, error);
      return [];
    }
  }

  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    try {
      const historyFilePath = this.getHistoryFilePath(sessionId);
      if (fs.existsSync(historyFilePath)) {
        const data = JSON.parse(fs.readFileSync(historyFilePath, 'utf-8'));
        if (data['']?.[sessionId]?.userId !== userId) {
          throw new ForbiddenException('无权访问该会话');
        }
        fs.unlinkSync(historyFilePath);
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to delete session ${sessionId}:`, error);
      return false;
    }
  }

  async assertSessionWritable(sessionId: string, userId: string): Promise<void> {
    const historyFilePath = this.getHistoryFilePath(sessionId);
    if (!fs.existsSync(historyFilePath)) return;

    const data = JSON.parse(fs.readFileSync(historyFilePath, 'utf-8'));
    const owner = data['']?.[sessionId]?.userId;
    if (owner !== userId) {
      throw new ForbiddenException('无权访问该会话');
    }
  }

  private getHistoryFilePath(sessionId: string): string {
    const safeSessionId = requireSafePathSegment(sessionId, '会话标识');
    return resolveWithinRoot(
      path.join(process.cwd(), 'chat_histories'),
      `session_${safeSessionId}.json`,
    );
  }

}
