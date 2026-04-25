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
const memory_service_1 = require("../memory/memory.service");
const nodes_1 = require("./nodes");
const milvus2_sdk_node_1 = require("@zilliz/milvus2-sdk-node");
const file_system_1 = require("@langchain/community/stores/message/file_system");
const messages_1 = require("@langchain/core/messages");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let AgentService = AgentService_1 = class AgentService {
    configService;
    milvusService;
    mcpService;
    toolsService;
    personaService;
    memoryService;
    model;
    embeddings;
    logger = new common_1.Logger(AgentService_1.name);
    embeddingCache = new Map();
    EMBEDDING_CACHE_TTL_MS = 10 * 60 * 1000;
    EMBEDDING_CACHE_MAX_SIZE = 200;
    constructor(configService, milvusService, mcpService, toolsService, personaService, memoryService) {
        this.configService = configService;
        this.milvusService = milvusService;
        this.mcpService = mcpService;
        this.toolsService = toolsService;
        this.personaService = personaService;
        this.memoryService = memoryService;
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
        const normalized = query.trim().toLowerCase();
        const now = Date.now();
        const cached = this.embeddingCache.get(normalized);
        if (cached && now - cached.ts < this.EMBEDDING_CACHE_TTL_MS) {
            return cached.vector;
        }
        const vector = await this.embeddings.embedQuery(query);
        this.embeddingCache.set(normalized, { vector, ts: now });
        if (this.embeddingCache.size > this.EMBEDDING_CACHE_MAX_SIZE) {
            const firstKey = this.embeddingCache.keys().next().value;
            if (firstKey) {
                this.embeddingCache.delete(firstKey);
            }
        }
        return vector;
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
            intent_classification: null,
            rewritten_queries: [],
            current_query_index: 0,
            retrieved_documents: [],
            critique: null,
            retry_count: 0,
            max_retries: 2,
            final_response: '',
            references: [],
            has_used_rag: false,
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
    formatContext(docs) {
        return docs
            .map((doc, i) => `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`)
            .join('\n\n');
    }
    extractTextFromContentArray(content) {
        let text = '';
        for (const item of content) {
            if (!item)
                continue;
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
    extractTextFromChunk(chunk) {
        if (!chunk)
            return '';
        if (typeof chunk === 'string')
            return chunk;
        if (typeof chunk.content === 'string')
            return chunk.content;
        if (Array.isArray(chunk.content))
            return this.extractTextFromContentArray(chunk.content);
        if (typeof chunk.text === 'string')
            return chunk.text;
        if (typeof chunk.delta?.text === 'string')
            return chunk.delta.text;
        if (typeof chunk.delta?.content === 'string')
            return chunk.delta.content;
        if (typeof chunk.message?.content === 'string')
            return chunk.message.content;
        if (Array.isArray(chunk.message?.content)) {
            return this.extractTextFromContentArray(chunk.message.content);
        }
        if (typeof chunk.kwargs?.content === 'string')
            return chunk.kwargs.content;
        if (Array.isArray(chunk.kwargs?.content)) {
            return this.extractTextFromContentArray(chunk.kwargs.content);
        }
        if (Array.isArray(chunk.choices)) {
            let text = '';
            for (const choice of chunk.choices) {
                if (typeof choice?.delta?.content === 'string') {
                    text += choice.delta.content;
                }
                else if (Array.isArray(choice?.delta?.content)) {
                    text += this.extractTextFromContentArray(choice.delta.content);
                }
                else if (typeof choice?.message?.content === 'string') {
                    text += choice.message.content;
                }
                else if (Array.isArray(choice?.message?.content)) {
                    text += this.extractTextFromContentArray(choice.message.content);
                }
            }
            return text;
        }
        return '';
    }
    createSearchNovelExpertTool(onProgress) {
        return (0, tools_1.tool)(async ({ search_query }) => {
            this.logger.log(`[Deep Search Tool] Triggered with query: ${search_query}`);
            if (onProgress)
                onProgress(`正在分析检索意图：${search_query}`);
            const MAX_RETRIES = 2;
            let retryCount = 0;
            let allDocs = [];
            try {
                const analysis = await this.analyzeQuery(search_query);
                const queries = analysis.sub_questions.length > 0 ? analysis.sub_questions : [search_query];
                if (onProgress)
                    onProgress(`正在数据库中检索小说片段...`);
                for (const q of queries) {
                    const topK = queries.length > 1 ? Math.min(6, analysis.top_k) : analysis.top_k;
                    const docs = await this.searchNovel(q, topK);
                    allDocs.push(...docs);
                }
                const is_adequate = allDocs.length > 0;
                const confidence = allDocs.length > 2 ? 0.8 : allDocs.length > 0 ? 0.6 : 0.3;
                while (!is_adequate && retryCount < MAX_RETRIES) {
                    retryCount++;
                    this.logger.log(`[Deep Search Tool] Retrieval not adequate, retry ${retryCount}/${MAX_RETRIES}`);
                    if (onProgress)
                        onProgress(`检索结果不足，正在进行第 ${retryCount} 次重试扩充...`);
                    const newDocs = await this.searchNovel(search_query, analysis.top_k + 2);
                    if (newDocs.length > 0) {
                        allDocs = newDocs;
                    }
                }
                if (onProgress)
                    onProgress(`检索与校验完成，准备生成回答...`);
                const context = this.formatContext(allDocs);
                return `【系统通知】已为你检索小说数据库。\n【评估结果】信心指数: ${confidence}\n【检索内容】\n${context || '未找到相关内容'}`;
            }
            catch (err) {
                this.logger.error(`Error in searchNovelExpertTool: ${err.message}`);
                if (onProgress)
                    onProgress(`搜索发生错误，正在切换降级方案...`);
                return `搜索小说内容时发生错误: ${err.message}`;
            }
        }, {
            name: 'search_novel_expert',
            description: '可选工具：当用户询问关于《天龙八部》小说的具体情节、人物细节、武功招式、地点等，且你不确定准确答案时，使用此工具进行检索。对于你可以直接回答的简单问题、普通问候或闲聊，无需调用。不要查询与小说无关的现实世界信息。',
            schema: zod_1.z.object({
                search_query: zod_1.z.string().describe('需要检索的具体小说相关问题，请尽量精简明确。'),
            }),
        });
    }
    createRetrieverNodeForRAG(_searchTool, baseTopK = 2) {
        return async (state) => {
            const pendingQueries = state.rewritten_queries
                .slice(state.current_query_index)
                .filter((q) => typeof q === 'string' && q.trim().length > 0);
            if (pendingQueries.length === 0) {
                return { next_action: 'critique' };
            }
            const topK = state.rewritten_queries.length > 1
                ? Math.min(4, baseTopK + state.rewritten_queries.length)
                : baseTopK;
            try {
                const results = await Promise.all(pendingQueries.map(async (q) => {
                    try {
                        const docs = await this.searchNovel(q, topK);
                        return { query: q, docs };
                    }
                    catch {
                        return { query: q, docs: [] };
                    }
                }));
                const mergedResults = [...state.retrieved_documents, ...results];
                return {
                    retrieved_documents: mergedResults,
                    current_query_index: state.rewritten_queries.length,
                    next_action: 'critique',
                };
            }
            catch (error) {
                const failedResults = pendingQueries.map((q) => ({ query: q, docs: [] }));
                return {
                    retrieved_documents: [...state.retrieved_documents, ...failedResults],
                    current_query_index: state.rewritten_queries.length,
                    next_action: 'critique',
                };
            }
        };
    }
    async *streamChat(query, persona = 'assistant', sessionId = 'default_session', userId = 'anonymous', abortSignal) {
        let allFoundReferences = [];
        const requestStartedAt = Date.now();
        const stageDurations = new Map();
        const stageCounts = new Map();
        let firstTokenLatencyMs = null;
        const recordStageTiming = (stage, durationMs) => {
            stageDurations.set(stage, (stageDurations.get(stage) || 0) + durationMs);
            stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
            this.logger.log(`[Timing] stage=${stage} duration=${durationMs}ms`);
        };
        try {
            const classifyNode = (0, nodes_1.createClassifyNode)(this.model);
            const directGeneratorNode = (0, nodes_1.createDirectGeneratorNode)(this.model, this.personaService.getPersonaPrompt.bind(this.personaService));
            const queryRewriterNode = (0, nodes_1.createQueryRewriterNode)(this.model);
            const critiqueNode = (0, nodes_1.createCritiqueNode)(this.model);
            const hybridRouterNode = (0, nodes_1.createHybridRouterNode)();
            let searchNovelTool = null;
            let retrieverNode = null;
            let generatorNode = null;
            let hybridGeneratorNode = null;
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
                if (generatorNode && hybridGeneratorNode)
                    return;
                const toolIntentPattern = /发邮件|发送邮件|邮箱|mail|email|位置|定位|地图|导航|路线|附近|高德|amap/i;
                const enableTools = toolIntentPattern.test(query);
                let tools = [];
                if (enableTools) {
                    if (!searchNovelTool) {
                        searchNovelTool = this.createSearchNovelExpertTool((msg) => {
                            this.logger.log(`[Search Progress] ${msg}`);
                        });
                    }
                    const mcpTools = await this.mcpService.getMcpTools();
                    const sendMailTool = this.toolsService.getSendMailTool();
                    tools = [searchNovelTool, ...mcpTools, sendMailTool];
                }
                generatorNode = (0, nodes_1.createGeneratorNode)(this.model, tools, this.personaService.getPersonaPrompt.bind(this.personaService));
                hybridGeneratorNode = (0, nodes_1.createHybridGeneratorNode)(this.model, tools, this.personaService.getPersonaPrompt.bind(this.personaService));
            };
            let currentState = {
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
            let loopCount = 0;
            const maxLoops = 8;
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
                            currentState = { ...currentState, ...classifyResult };
                            if (currentState.intent_classification) {
                                yield { type: 'intent', data: currentState.intent_classification };
                            }
                            break;
                        case 'direct_generate':
                            const directResult = await directGeneratorNode(currentState);
                            if (directResult.stream) {
                                for await (const chunk of directResult.stream) {
                                    const chunkText = this.extractTextFromChunk(chunk);
                                    if (chunkText) {
                                        if (firstTokenLatencyMs === null) {
                                            firstTokenLatencyMs = Date.now() - requestStartedAt;
                                        }
                                        currentState.final_response += chunkText;
                                        yield { type: 'content', data: chunkText };
                                    }
                                }
                            }
                            else if (directResult.final_response) {
                                if (firstTokenLatencyMs === null) {
                                    firstTokenLatencyMs = Date.now() - requestStartedAt;
                                }
                                currentState.final_response += directResult.final_response;
                                yield { type: 'content', data: directResult.final_response };
                            }
                            currentState = { ...currentState, ...directResult, final_response: currentState.final_response || directResult.final_response || '' };
                            break;
                        case 'rewrite':
                            yield { type: 'thinking', data: '正在改写查询...' };
                            const rewriteResult = await queryRewriterNode(currentState);
                            currentState = { ...currentState, ...rewriteResult };
                            break;
                        case 'retrieve':
                            yield { type: 'thinking', data: '正在检索小说片段...' };
                            ensureRetrieverNode();
                            const retrieveResult = await retrieverNode(currentState);
                            currentState = { ...currentState, ...retrieveResult };
                            break;
                        case 'critique':
                            yield { type: 'thinking', data: '正在评估检索结果...' };
                            const critiqueResult = await critiqueNode(currentState);
                            currentState = { ...currentState, ...critiqueResult };
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
                            if (generateResult.stream) {
                                for await (const chunk of generateResult.stream) {
                                    const chunkText = this.extractTextFromChunk(chunk);
                                    if (chunkText) {
                                        if (firstTokenLatencyMs === null) {
                                            firstTokenLatencyMs = Date.now() - requestStartedAt;
                                        }
                                        currentState.final_response += chunkText;
                                        yield { type: 'content', data: chunkText };
                                    }
                                }
                            }
                            else if (generateResult.final_response) {
                                if (firstTokenLatencyMs === null) {
                                    firstTokenLatencyMs = Date.now() - requestStartedAt;
                                }
                                currentState.final_response += generateResult.final_response;
                                yield { type: 'content', data: generateResult.final_response };
                            }
                            currentState = { ...currentState, ...generateResult, final_response: currentState.final_response || generateResult.final_response || '' };
                            break;
                        case 'hybrid_generate':
                            yield { type: 'thinking', data: '混合模式生成中...' };
                            await ensureGenerationNodes();
                            const hybridResult = await hybridGeneratorNode(currentState);
                            if (hybridResult.references && hybridResult.references.length > 0) {
                                allFoundReferences = hybridResult.references;
                                yield { type: 'references', data: allFoundReferences };
                            }
                            if (hybridResult.stream) {
                                for await (const chunk of hybridResult.stream) {
                                    const chunkText = this.extractTextFromChunk(chunk);
                                    if (chunkText) {
                                        if (firstTokenLatencyMs === null) {
                                            firstTokenLatencyMs = Date.now() - requestStartedAt;
                                        }
                                        currentState.final_response += chunkText;
                                        yield { type: 'content', data: chunkText };
                                    }
                                }
                            }
                            else if (hybridResult.final_response) {
                                if (firstTokenLatencyMs === null) {
                                    firstTokenLatencyMs = Date.now() - requestStartedAt;
                                }
                                currentState.final_response += hybridResult.final_response;
                                yield { type: 'content', data: hybridResult.final_response };
                            }
                            currentState = { ...currentState, ...hybridResult, final_response: currentState.final_response || hybridResult.final_response || '' };
                            break;
                        default:
                            this.logger.warn(`Unknown next_action: ${currentState.next_action}`);
                            currentState.next_action = 'done';
                    }
                    recordStageTiming(stageName, Date.now() - stageStart);
                }
                catch (error) {
                    this.logger.error(`Error in state ${currentState.next_action}: ${error.message}`);
                    currentState.final_response = `处理出错: ${error.message}`;
                    currentState.next_action = 'done';
                    yield { type: 'content', data: currentState.final_response };
                }
            }
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
            this.logger.log(`[Timing Summary] total=${totalDurationMs}ms, first_token=${firstTokenLatencyMs ?? -1}ms, ${timingSummary}`);
            yield {
                type: 'metrics',
                data: {
                    total_ms: totalDurationMs,
                    first_token_ms: firstTokenLatencyMs,
                    stages: Object.fromEntries(stageDurations),
                },
            };
            const historyDir = path.join(process.cwd(), 'chat_histories');
            if (!fs.existsSync(historyDir)) {
                fs.mkdirSync(historyDir, { recursive: true });
            }
            const historyFilePath = path.join(historyDir, `session_${sessionId}.json`);
            const history = new file_system_1.FileSystemChatMessageHistory({
                sessionId: sessionId,
                filePath: historyFilePath,
            });
            if (!abortSignal?.aborted) {
                const userMsg = new messages_1.HumanMessage(query);
                const aiMsg = new messages_1.AIMessage(currentState.final_response || '');
                let oldMessages = await history.getMessages();
                const SUMMARY_PREFIX = '【历史对话摘要】\n';
                let existingSummary = '';
                let summaryMsgIndex = -1;
                for (let i = 0; i < oldMessages.length; i++) {
                    const msg = oldMessages[i];
                    if (msg instanceof messages_1.SystemMessage && typeof msg.content === 'string' && msg.content.startsWith(SUMMARY_PREFIX)) {
                        existingSummary = msg.content.substring(SUMMARY_PREFIX.length);
                        summaryMsgIndex = i;
                        break;
                    }
                }
                let conversationMessages = oldMessages;
                if (summaryMsgIndex !== -1) {
                    conversationMessages = oldMessages.filter((_, index) => index !== summaryMsgIndex);
                }
                conversationMessages = conversationMessages.filter((msg) => {
                    if (msg instanceof messages_1.ToolMessage)
                        return false;
                    if (msg instanceof messages_1.AIMessage && msg.tool_calls && msg.tool_calls.length > 0)
                        return false;
                    return true;
                });
                const MAX_WINDOW_SIZE = 10;
                const SUMMARY_TRIGGER_THRESHOLD = 14;
                if (conversationMessages.length >= SUMMARY_TRIGGER_THRESHOLD) {
                    const numMessagesToSummarize = conversationMessages.length - MAX_WINDOW_SIZE;
                    const messagesToSummarize = conversationMessages.slice(0, numMessagesToSummarize);
                    conversationMessages = conversationMessages.slice(numMessagesToSummarize);
                    const formattedMessagesForSummary = messagesToSummarize
                        .map((m) => `${m instanceof messages_1.HumanMessage ? 'User' : 'Assistant'}: ${m.content}`)
                        .join('\n');
                    const summaryPrompt = `你是一个有用的AI助手。请根据以下先前的对话摘要（如果有）和新的对话记录，生成一个简短且连贯的更新版对话摘要。请保留重要的事实、偏好和上下文信息。只返回摘要文本，不要有任何其他多余的解释。

之前的摘要：
${existingSummary || '无'}

新的对话记录：
${formattedMessagesForSummary}`;
                    this.model.invoke([new messages_1.HumanMessage(summaryPrompt)])
                        .then(async (summaryResponse) => {
                        const newSummary = summaryResponse.content;
                        await history.clear();
                        await history.addMessage(new messages_1.SystemMessage(`${SUMMARY_PREFIX}${newSummary}`));
                        for (const msg of conversationMessages) {
                            await history.addMessage(msg);
                        }
                        await history.addMessage(userMsg);
                        await history.addMessage(aiMsg);
                    })
                        .catch(async (error) => {
                        this.logger.error('Failed to generate history summary:', error);
                        await history.addMessage(userMsg);
                        await history.addMessage(aiMsg);
                    });
                }
                else {
                    await history.addMessage(userMsg);
                    await history.addMessage(aiMsg);
                }
                this.memoryService.processAndStoreMemory(userId, sessionId, query)
                    .catch((e) => this.logger.warn(`Failed to process memory: ${e}`));
            }
        }
        catch (error) {
            this.logger.error('Agent stream error:', error);
            yield { type: 'error', data: error.message };
        }
    }
    async chat(query, persona = 'assistant', sessionId = 'default_session', userId = 'anonymous') {
        let response = '';
        let references = [];
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
    async getHistoryList() {
        const historyDir = path.join(process.cwd(), 'chat_histories');
        if (!fs.existsSync(historyDir))
            return [];
        const list = [];
        try {
            const files = fs.readdirSync(historyDir).filter(f => f.startsWith('session_') && f.endsWith('.json'));
            for (const file of files) {
                const historyFilePath = path.join(historyDir, file);
                const sessionId = file.replace('session_', '').replace('.json', '');
                try {
                    const content = fs.readFileSync(historyFilePath, 'utf-8');
                    const data = JSON.parse(content);
                    const sessionData = data['']?.[sessionId] || {};
                    const messages = sessionData.messages || [];
                    let title = '新对话';
                    if (Array.isArray(messages) && messages.length > 0) {
                        const firstHumanMsg = messages.find((m) => m.type === 'human');
                        if (firstHumanMsg && firstHumanMsg.data && firstHumanMsg.data.content) {
                            title = firstHumanMsg.data.content.substring(0, 20) + (firstHumanMsg.data.content.length > 20 ? '...' : '');
                        }
                        else {
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
                }
                catch (e) {
                    this.logger.error(`Error reading history file ${file}:`, e);
                }
            }
        }
        catch (error) {
            this.logger.error(`Error listing history directory:`, error);
        }
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    async getSessionHistory(sessionId) {
        const historyFilePath = path.join(process.cwd(), 'chat_histories', `session_${sessionId}.json`);
        const oldHistoryFilePath = path.join(process.cwd(), 'chat_histories', 'messages.json');
        const targetFilePath = fs.existsSync(historyFilePath) ? historyFilePath : (fs.existsSync(oldHistoryFilePath) ? oldHistoryFilePath : null);
        if (!targetFilePath)
            return [];
        try {
            const content = fs.readFileSync(targetFilePath, 'utf-8');
            const data = JSON.parse(content);
            const rawMessages = data['']?.[sessionId]?.messages || [];
            const messages = [];
            for (const msg of rawMessages) {
                if (!msg.type || !msg.data)
                    continue;
                if (msg.type === 'human') {
                    messages.push({ role: 'user', content: msg.data.content });
                }
                else if (msg.type === 'ai' && msg.data.content) {
                    if (typeof msg.data.content === 'string' && msg.data.content.trim().length > 0) {
                        messages.push({ role: 'assistant', content: msg.data.content });
                    }
                }
                else if (msg.type === 'system' && typeof msg.data.content === 'string' && msg.data.content.startsWith('【历史对话摘要】')) {
                    messages.push({ role: 'assistant', content: `*${msg.data.content}*` });
                }
            }
            return messages;
        }
        catch (error) {
            this.logger.error(`Error parsing session history ${sessionId}:`, error);
            return [];
        }
    }
    async deleteSession(sessionId) {
        try {
            const historyFilePath = path.join(process.cwd(), 'chat_histories', `session_${sessionId}.json`);
            if (fs.existsSync(historyFilePath)) {
                fs.unlinkSync(historyFilePath);
            }
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to delete session ${sessionId}:`, error);
            return false;
        }
    }
};
exports.AgentService = AgentService;
exports.AgentService = AgentService = AgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        milvus_service_1.MilvusService,
        mcp_service_1.McpService,
        tools_service_1.ToolsService,
        persona_service_1.PersonaService,
        memory_service_1.MemoryService])
], AgentService);
//# sourceMappingURL=agent.service.js.map