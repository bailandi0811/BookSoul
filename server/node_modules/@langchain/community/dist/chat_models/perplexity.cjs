Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_runtime = require("../_virtual/_rolldown/runtime.cjs");
const require_output_parsers = require("../utils/output_parsers.cjs");
let _langchain_core_utils_types = require("@langchain/core/utils/types");
let _langchain_core_output_parsers = require("@langchain/core/output_parsers");
let _langchain_core_language_models_chat_models = require("@langchain/core/language_models/chat_models");
let _langchain_core_messages = require("@langchain/core/messages");
let _langchain_core_outputs = require("@langchain/core/outputs");
let _langchain_core_utils_env = require("@langchain/core/utils/env");
let _langchain_core_utils_stream = require("@langchain/core/utils/stream");
let _langchain_core_runnables = require("@langchain/core/runnables");
let _langchain_core_utils_json_schema = require("@langchain/core/utils/json_schema");
let openai = require("openai");
openai = require_runtime.__toESM(openai);
//#region src/chat_models/perplexity.ts
var perplexity_exports = /* @__PURE__ */ require_runtime.__exportAll({ ChatPerplexity: () => ChatPerplexity });
/**
* Wrapper around Perplexity large language models that use the Chat endpoint.
*/
var ChatPerplexity = class extends _langchain_core_language_models_chat_models.BaseChatModel {
	static lc_name() {
		return "ChatPerplexity";
	}
	model;
	temperature;
	maxTokens;
	apiKey;
	timeout;
	streaming;
	topP;
	searchDomainFilter;
	returnImages;
	returnRelatedQuestions;
	searchRecencyFilter;
	topK;
	presencePenalty;
	frequencyPenalty;
	searchMode;
	reasoningEffort;
	searchAfterDateFilter;
	searchBeforeDateFilter;
	lastUpdatedAfterFilter;
	lastUpdatedBeforeFilter;
	disableSearch;
	enableSearchClassifier;
	webSearchOptions;
	client;
	constructor(fields) {
		super(fields ?? {});
		this.model = fields.model;
		this.temperature = fields?.temperature ?? this.temperature;
		this.maxTokens = fields?.maxTokens;
		this.apiKey = fields?.apiKey ?? (0, _langchain_core_utils_env.getEnvironmentVariable)("PERPLEXITY_API_KEY");
		this.streaming = fields?.streaming ?? this.streaming;
		this.timeout = fields?.timeout;
		this.topP = fields?.topP ?? this.topP;
		this.returnImages = fields?.returnImages ?? this.returnImages;
		this.returnRelatedQuestions = fields?.returnRelatedQuestions ?? this.returnRelatedQuestions;
		this.topK = fields?.topK ?? this.topK;
		this.presencePenalty = fields?.presencePenalty ?? this.presencePenalty;
		this.frequencyPenalty = fields?.frequencyPenalty ?? this.frequencyPenalty;
		this.searchDomainFilter = fields?.searchDomainFilter ?? this.searchDomainFilter;
		this.searchRecencyFilter = fields?.searchRecencyFilter ?? this.searchRecencyFilter;
		this.searchMode = fields?.searchMode;
		this.reasoningEffort = fields?.reasoningEffort;
		this.searchAfterDateFilter = fields?.searchAfterDateFilter;
		this.searchBeforeDateFilter = fields?.searchBeforeDateFilter;
		this.webSearchOptions = fields?.webSearchOptions;
		if (!this.apiKey) throw new Error("Perplexity API key not found");
		this.client = new openai.default({
			apiKey: this.apiKey,
			baseURL: "https://api.perplexity.ai"
		});
	}
	_llmType() {
		return "perplexity";
	}
	/**
	* Get the parameters used to invoke the model
	*/
	invocationParams(options) {
		return {
			model: this.model,
			temperature: this.temperature,
			max_tokens: this.maxTokens,
			stream: this.streaming,
			top_p: this.topP,
			return_images: this.returnImages,
			return_related_questions: this.returnRelatedQuestions,
			top_k: this.topK,
			presence_penalty: this.presencePenalty,
			frequency_penalty: this.frequencyPenalty,
			response_format: options?.response_format,
			search_domain_filter: this.searchDomainFilter,
			search_recency_filter: this.searchRecencyFilter,
			search_mode: this.searchMode,
			reasoning_effort: this.reasoningEffort,
			search_after_date_filter: this.searchAfterDateFilter,
			search_before_date_filter: this.searchBeforeDateFilter,
			last_updated_after_filter: this.lastUpdatedAfterFilter,
			last_updated_before_filter: this.lastUpdatedBeforeFilter,
			disable_search: this.disableSearch,
			enable_search_classifier: this.enableSearchClassifier,
			web_search_options: this.webSearchOptions
		};
	}
	/**
	* Convert a message to a format that the model expects
	*/
	messageToPerplexityRole(message) {
		if (message._getType() === "human") return {
			role: "user",
			content: message.content.toString()
		};
		else if (message._getType() === "ai") return {
			role: "assistant",
			content: message.content.toString()
		};
		else if (message._getType() === "system") return {
			role: "system",
			content: message.content.toString()
		};
		throw new Error(`Unknown message type: ${message}`);
	}
	async _generate(messages, options, runManager) {
		const tokenUsage = {};
		const messagesList = messages.map((message) => this.messageToPerplexityRole(message));
		if (this.streaming) {
			const stream = this._streamResponseChunks(messages, options, runManager);
			const finalChunks = {};
			for await (const chunk of stream) {
				const index = chunk.generationInfo?.completion ?? 0;
				if (finalChunks[index] === void 0) finalChunks[index] = chunk;
				else finalChunks[index] = (0, _langchain_core_utils_stream.concat)(finalChunks[index], chunk);
			}
			return { generations: Object.entries(finalChunks).sort(([aKey], [bKey]) => parseInt(aKey, 10) - parseInt(bKey, 10)).map(([_, value]) => value) };
		}
		const response = await this.client.chat.completions.create({
			messages: messagesList,
			...this.invocationParams(options),
			stream: false
		});
		const { message } = response.choices[0];
		const generations = [];
		generations.push({
			text: message.content ?? "",
			message: new _langchain_core_messages.AIMessage({
				content: message.content ?? "",
				additional_kwargs: { citations: response.citations }
			})
		});
		if (response.usage) {
			tokenUsage.promptTokens = response.usage.prompt_tokens;
			tokenUsage.completionTokens = response.usage.completion_tokens;
			tokenUsage.totalTokens = response.usage.total_tokens;
		}
		return {
			generations,
			llmOutput: { tokenUsage }
		};
	}
	async *_streamResponseChunks(messages, options, runManager) {
		const messagesList = messages.map((message) => this.messageToPerplexityRole(message));
		const stream = await this.client.chat.completions.create({
			messages: messagesList,
			...this.invocationParams(options),
			stream: true
		});
		let firstChunk = true;
		for await (const chunk of stream) {
			const choice = chunk.choices[0];
			const { delta } = choice;
			const citations = chunk.citations ?? [];
			if (!delta.content) continue;
			let messageChunk;
			if (delta.role === "user") messageChunk = new _langchain_core_messages.HumanMessageChunk({ content: delta.content });
			else if (delta.role === "assistant") messageChunk = new _langchain_core_messages.AIMessageChunk({ content: delta.content });
			else if (delta.role === "system") messageChunk = new _langchain_core_messages.SystemMessageChunk({ content: delta.content });
			else messageChunk = new _langchain_core_messages.ChatMessageChunk({
				content: delta.content,
				role: delta.role ?? "assistant"
			});
			if (firstChunk) {
				messageChunk.additional_kwargs.citations = citations;
				firstChunk = false;
			}
			yield new _langchain_core_outputs.ChatGenerationChunk({
				message: messageChunk,
				text: delta.content,
				generationInfo: { finishReason: choice.finish_reason }
			});
			if (runManager) await runManager.handleLLMNewToken(delta.content);
		}
	}
	withStructuredOutput(outputSchema, config) {
		if (config?.strict) throw new Error(`"strict" mode is not supported for this model.`);
		let schema = outputSchema;
		if ((0, _langchain_core_utils_types.isInteropZodSchema)(schema)) schema = (0, _langchain_core_utils_json_schema.toJsonSchema)(schema);
		const name = config?.name;
		const description = schema.description ?? "Format to use when returning your response";
		const method = config?.method ?? "jsonSchema";
		const includeRaw = config?.includeRaw;
		if (method !== "jsonSchema") throw new Error(`Perplexity only supports "jsonSchema" as a structured output method.`);
		const llm = this.withConfig({ response_format: {
			type: "json_schema",
			json_schema: {
				name: name ?? "extract",
				description,
				schema
			}
		} });
		let outputParser;
		const isReasoningModel = this.model.toLowerCase().includes("reasoning");
		if ((0, _langchain_core_utils_types.isInteropZodSchema)(schema)) if (isReasoningModel) outputParser = new require_output_parsers.ReasoningStructuredOutputParser(schema);
		else outputParser = _langchain_core_output_parsers.StructuredOutputParser.fromZodSchema(schema);
		else if (isReasoningModel) outputParser = new require_output_parsers.ReasoningJsonOutputParser(schema);
		else outputParser = new _langchain_core_output_parsers.JsonOutputParser();
		if (!includeRaw) return llm.pipe(outputParser);
		const parserAssign = _langchain_core_runnables.RunnablePassthrough.assign({ parsed: (input, config) => outputParser.invoke(input.raw, config) });
		const parserNone = _langchain_core_runnables.RunnablePassthrough.assign({ parsed: () => null });
		const parsedWithFallback = parserAssign.withFallbacks({ fallbacks: [parserNone] });
		return _langchain_core_runnables.RunnableSequence.from([{ raw: llm }, parsedWithFallback]);
	}
};
//#endregion
exports.ChatPerplexity = ChatPerplexity;
Object.defineProperty(exports, "perplexity_exports", {
	enumerable: true,
	get: function() {
		return perplexity_exports;
	}
});

//# sourceMappingURL=perplexity.cjs.map