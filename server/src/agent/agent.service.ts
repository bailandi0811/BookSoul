import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { MilvusService } from '../milvus/milvus.service';
import { McpService } from '../mcp/mcp.service';
import { ToolsService } from '../tools/tools.service';
import { PersonaService } from '../persona/persona.service';
import { createQueryRewriterNode, createCritiqueNode } from './nodes';
import { MetricType } from '@zilliz/milvus2-sdk-node';
import { ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

interface QueryAnalysis {
  type: 'simple' | 'compare' | 'multi_hop' | 'broad';
  rewritten_query: string;
  sub_questions: string[];
  top_k: number;
  reasoning: string;
}

interface CritiqueResult {
  is_adequate: boolean;
  confidence: number;
  missing_aspects: string[];
  suggested_rewrite: string;
  reasoning: string;
}

@Injectable()
export class AgentService implements OnModuleInit {
  private model: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private configService: ConfigService,
    private milvusService: MilvusService,
    private mcpService: McpService,
    private toolsService: ToolsService,
    private personaService: PersonaService,
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
    return await this.embeddings.embedQuery(query);
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
      rewritten_queries: [] as string[],
      current_query_index: 0,
      retrieved_documents: [] as any[],
      critique: null,
      retry_count: 0,
      final_response: '',
      references: [] as any[],
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

  private async critiqueResults(query: string, docs: any[]): Promise<CritiqueResult> {
    const critiqueAgent = createCritiqueNode(this.model);
    const state = {
      query,
      persona: 'assistant',
      rewritten_queries: [] as string[],
      current_query_index: 0,
      retrieved_documents: [{ query, docs }] as any[],
      critique: null as CritiqueResult | null,
      retry_count: 0,
      final_response: '',
      references: [] as any[],
      messages: [] as any[],
      next_action: 'critique' as const,
      tool_calls: [] as any[],
    };
    const result = await critiqueAgent(state);
    return result.critique || {
      is_adequate: docs.length > 0,
      confidence: 0.5,
      missing_aspects: [],
      suggested_rewrite: '',
      reasoning: 'Default critique',
    };
  }

  private formatContext(docs: any[]): string {
    return docs
      .map((doc, i) =>
        `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`
      )
      .join('\n\n');
  }

  async *streamChat(
    query: string,
    persona: string = 'assistant',
    abortSignal?: AbortSignal,
  ): AsyncGenerator<{ type: string; data: any }> {
    const personaPrompt = this.personaService.getPersonaPrompt(persona);
    let allFoundReferences: any[] = [];

    // 将原本的 CRAG 流程封装为一个强大的小说检索工具
    const searchNovelExpertTool = tool(
      async ({ search_query }) => {
        this.logger.log(`[Deep Search Tool] Triggered with query: ${search_query}`);
        const MAX_RETRIES = 2;
        let retryCount = 0;
        let allDocs: any[] = [];

        try {
          // 1. Query Analysis
          const analysis = await this.analyzeQuery(search_query);
          const queries = analysis.sub_questions.length > 0 ? analysis.sub_questions : [search_query];

          // 2. Initial Retrieve
          for (const q of queries) {
            const topK = queries.length > 1 ? Math.min(6, analysis.top_k) : analysis.top_k;
            const docs = await this.searchNovel(q, topK);
            allDocs.push(...docs);
          }

          // 3. Critique
          const critique = await this.critiqueResults(search_query, allDocs);

          // 4. Retry if not adequate
          while (!critique.is_adequate && retryCount < MAX_RETRIES) {
            retryCount++;
            this.logger.log(`[Deep Search Tool] Retrieval not adequate, retry ${retryCount}/${MAX_RETRIES}`);
            
            const newQuery = critique.suggested_rewrite || search_query;
            const newDocs = await this.searchNovel(newQuery, analysis.top_k + 2);

            if (newDocs.length > 0) {
              allDocs = newDocs; // 在这里我们直接用新的结果覆盖旧的，以获得更准确的上下文
            }

            const newCritique = await this.critiqueResults(search_query, allDocs);
            Object.assign(critique, newCritique);
          }

          // 保存结果供外部获取
          allFoundReferences = allDocs;

          const context = this.formatContext(allDocs);
          return `【系统通知】已为你检索小说数据库。\n【评估结果】信心指数: ${critique.confidence}\n【检索内容】\n${context || '未找到相关内容'}`;
        } catch (err: any) {
          this.logger.error(`Error in searchNovelExpertTool: ${err.message}`);
          return `搜索小说内容时发生错误: ${err.message}`;
        }
      },
      {
        name: 'search_novel_expert',
        description: '【强制规则】只要用户问的问题涉及到《天龙八部》小说的人物、情节、武功、地点等小说内部信息，就必须调用此工具。它拥有极强的小说上下文理解和纠错检索能力。不要将此工具用于查询现实世界的位置或天气。',
        schema: z.object({
          search_query: z.string().describe('需要检索的具体小说相关问题，请尽量精简明确。'),
        }),
      }
    );

    try {
      const mcpTools = await this.mcpService.getMcpTools();
      const sendMailTool = this.toolsService.getSendMailTool();
      
      const tools = [searchNovelExpertTool, ...mcpTools, sendMailTool];
      
      const agent = createReactAgent({
        llm: this.model,
        tools: tools,
      });

      const systemMessage = `${personaPrompt}\n\n你是一个具备智能决策能力的AI。如果用户只是进行普通问候（如"你好"）、闲聊，或是询问与小说无关的真实世界信息（如真实位置、当前天气等），请直接回答或使用相应的现实工具（如MCP工具）。
如果你需要查询用户的 IP、地理位置或当前所在城市，请使用 \`fetch\` 工具调用 \`http://ip-api.com/json\` 或者其他你知晓的 API。
**只有当用户明确询问《天龙八部》小说内容时，才必须调用 search_novel_expert 工具进行检索。**`;

      const eventStream = await agent.streamEvents(
        {
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: query },
          ],
        },
        { version: 'v2', signal: abortSignal }
      );

      let hasEmittedReferences = false;

      for await (const event of eventStream) {
        if (abortSignal?.aborted) {
          this.logger.log('Agent stream aborted by client');
          break;
        }

        // 如果小说搜索工具被调用并找到了数据，第一时间把 references 吐给前端
        if (allFoundReferences.length > 0 && !hasEmittedReferences) {
          yield { type: 'references', data: allFoundReferences };
          hasEmittedReferences = true;
        }

        if (event.event === 'on_chat_model_stream') {
          if (event.data.chunk.content && typeof event.data.chunk.content === 'string') {
            yield { type: 'content', data: event.data.chunk.content };
          }
        }
      }

    } catch (error: any) {
      this.logger.error('Agent stream error:', error);
      yield { type: 'error', data: error.message };
    }
  }

  async chat(query: string, persona: string = 'assistant'): Promise<{
    response: string;
    references: any[];
  }> {
    let response = '';
    let references: any[] = [];

    for await (const event of this.streamChat(query, persona)) {
      if (event.type === 'content' || event.type === 'final') {
        response += event.data;
      }
      if (event.type === 'references') {
        references = event.data;
      }
    }

    return { response, references };
  }
}
