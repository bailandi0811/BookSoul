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
var AgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = require("@langchain/openai");
const milvus_service_1 = require("../milvus/milvus.service");
const mcp_service_1 = require("../mcp/mcp.service");
const tools_service_1 = require("../tools/tools.service");
const persona_service_1 = require("../persona/persona.service");
const nodes_1 = require("./nodes");
const milvus2_sdk_node_1 = require("@zilliz/milvus2-sdk-node");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
let AgentService = AgentService_1 = class AgentService {
    configService;
    milvusService;
    mcpService;
    toolsService;
    personaService;
    model;
    embeddings;
    logger = new common_1.Logger(AgentService_1.name);
    constructor(configService, milvusService, mcpService, toolsService, personaService) {
        this.configService = configService;
        this.milvusService = milvusService;
        this.mcpService = mcpService;
        this.toolsService = toolsService;
        this.personaService = personaService;
        this.embeddings = new openai_1.OpenAIEmbeddings({
            apiKey: this.configService.get('openai.apiKey'),
            model: this.configService.get('openai.embeddingModel'),
            configuration: {
                baseURL: this.configService.get('openai.baseUrl'),
            },
            dimensions: this.configService.get('milvus.vectorDim'),
        });
        this.model = new openai_1.ChatOpenAI({
            temperature: 0.7,
            apiKey: this.configService.get('openai.apiKey'),
            model: this.configService.get('openai.chatModel'),
            configuration: {
                baseURL: this.configService.get('openai.baseUrl'),
            },
            streaming: true,
        });
    }
    async onModuleInit() {
        this.logger.log('AgentService initialized');
    }
    async embedQuery(query) {
        return await this.embeddings.embedQuery(query);
    }
    async searchNovel(query, topK) {
        try {
            const queryVector = await this.embedQuery(query);
            const searchResult = await this.milvusService.getClient().search({
                collection_name: this.configService.get('milvus.collectionName') || 'ebook',
                vector: queryVector,
                limit: topK,
                metric_type: milvus2_sdk_node_1.MetricType.COSINE,
                output_fields: ['content', 'chapter_num', 'book_name'],
            });
            return searchResult.results || [];
        }
        catch (error) {
            this.logger.error('Vector search failed:', error);
            return [];
        }
    }
    async analyzeQuery(query) {
        const queryRewriter = (0, nodes_1.createQueryRewriterNode)(this.model);
        const state = {
            query,
            persona: 'assistant',
            rewritten_queries: [],
            current_query_index: 0,
            retrieved_documents: [],
            critique: null,
            retry_count: 0,
            final_response: '',
            references: [],
            messages: [],
            next_action: 'rewrite',
            tool_calls: [],
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
    async critiqueResults(query, docs) {
        const critiqueAgent = (0, nodes_1.createCritiqueNode)(this.model);
        const state = {
            query,
            persona: 'assistant',
            rewritten_queries: [],
            current_query_index: 0,
            retrieved_documents: [{ query, docs }],
            critique: null,
            retry_count: 0,
            final_response: '',
            references: [],
            messages: [],
            next_action: 'critique',
            tool_calls: [],
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
    formatContext(docs) {
        return docs
            .map((doc, i) => `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`)
            .join('\n\n');
    }
    async *streamChat(query, persona = 'assistant', abortSignal) {
        const personaPrompt = this.personaService.getPersonaPrompt(persona);
        let allFoundReferences = [];
        const searchNovelExpertTool = (0, tools_1.tool)(async ({ search_query }) => {
            this.logger.log(`[Deep Search Tool] Triggered with query: ${search_query}`);
            const MAX_RETRIES = 2;
            let retryCount = 0;
            let allDocs = [];
            try {
                const analysis = await this.analyzeQuery(search_query);
                const queries = analysis.sub_questions.length > 0 ? analysis.sub_questions : [search_query];
                for (const q of queries) {
                    const topK = queries.length > 1 ? Math.min(6, analysis.top_k) : analysis.top_k;
                    const docs = await this.searchNovel(q, topK);
                    allDocs.push(...docs);
                }
                const critique = await this.critiqueResults(search_query, allDocs);
                while (!critique.is_adequate && retryCount < MAX_RETRIES) {
                    retryCount++;
                    this.logger.log(`[Deep Search Tool] Retrieval not adequate, retry ${retryCount}/${MAX_RETRIES}`);
                    const newQuery = critique.suggested_rewrite || search_query;
                    const newDocs = await this.searchNovel(newQuery, analysis.top_k + 2);
                    if (newDocs.length > 0) {
                        allDocs = newDocs;
                    }
                    const newCritique = await this.critiqueResults(search_query, allDocs);
                    Object.assign(critique, newCritique);
                }
                allFoundReferences = allDocs;
                const context = this.formatContext(allDocs);
                return `【系统通知】已为你检索小说数据库。\n【评估结果】信心指数: ${critique.confidence}\n【检索内容】\n${context || '未找到相关内容'}`;
            }
            catch (err) {
                this.logger.error(`Error in searchNovelExpertTool: ${err.message}`);
                return `搜索小说内容时发生错误: ${err.message}`;
            }
        }, {
            name: 'search_novel_expert',
            description: '【强制规则】只要用户问的问题涉及到《天龙八部》小说的人物、情节、武功、地点等小说内部信息，就必须调用此工具。它拥有极强的小说上下文理解和纠错检索能力。不要将此工具用于查询现实世界的位置或天气。',
            schema: zod_1.z.object({
                search_query: zod_1.z.string().describe('需要检索的具体小说相关问题，请尽量精简明确。'),
            }),
        });
        try {
            const mcpTools = await this.mcpService.getMcpTools();
            const sendMailTool = this.toolsService.getSendMailTool();
            const tools = [searchNovelExpertTool, ...mcpTools, sendMailTool];
            const agent = (0, prebuilt_1.createReactAgent)({
                llm: this.model,
                tools: tools,
            });
            const systemMessage = `${personaPrompt}\n\n你是一个具备智能决策能力的AI。如果用户只是进行普通问候（如"你好"）、闲聊，或是询问与小说无关的真实世界信息（如真实位置、当前天气等），请直接回答或使用相应的现实工具（如MCP工具）。
如果你需要查询用户的 IP、地理位置或当前所在城市，请使用 \`fetch\` 工具调用 \`http://ip-api.com/json\` 或者其他你知晓的 API。
**只有当用户明确询问《天龙八部》小说内容时，才必须调用 search_novel_expert 工具进行检索。**`;
            const eventStream = await agent.streamEvents({
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: query },
                ],
            }, { version: 'v2', signal: abortSignal });
            let hasEmittedReferences = false;
            for await (const event of eventStream) {
                if (abortSignal?.aborted) {
                    this.logger.log('Agent stream aborted by client');
                    break;
                }
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
        }
        catch (error) {
            this.logger.error('Agent stream error:', error);
            yield { type: 'error', data: error.message };
        }
    }
    async chat(query, persona = 'assistant') {
        let response = '';
        let references = [];
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
};
exports.AgentService = AgentService;
exports.AgentService = AgentService = AgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        milvus_service_1.MilvusService,
        mcp_service_1.McpService,
        tools_service_1.ToolsService,
        persona_service_1.PersonaService])
], AgentService);
//# sourceMappingURL=agent.service.js.map