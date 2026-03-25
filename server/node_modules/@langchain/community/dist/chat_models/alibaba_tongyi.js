import { __exportAll } from "../_virtual/_rolldown/runtime.js";
import { getSchemaDescription, isInteropZodSchema } from "@langchain/core/utils/types";
import { convertLangChainToolCallToOpenAI, makeInvalidToolCall, parseToolCall } from "@langchain/core/output_parsers/openai_tools";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, AIMessageChunk, ChatMessage } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { getEnvironmentVariable } from "@langchain/core/utils/env";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { RunnableLambda, RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
//#region src/chat_models/alibaba_tongyi.ts
var alibaba_tongyi_exports = /* @__PURE__ */ __exportAll({ ChatAlibabaTongyi: () => ChatAlibabaTongyi });
/**
* Function that extracts the custom role of a generic chat message.
* @param message Chat message from which to extract the custom role.
* @returns The custom role of the chat message.
*/
function extractGenericMessageCustomRole(message) {
	if (![
		"system",
		"assistant",
		"user",
		"tool"
	].includes(message.role)) console.warn(`Unknown message role: ${message.role}`);
	return message.role;
}
function normalizeToolCall(rawToolCall) {
	const rawArguments = rawToolCall.function?.arguments;
	const normalizedArguments = typeof rawArguments === "string" ? rawArguments : JSON.stringify(rawArguments ?? {});
	return {
		...rawToolCall,
		function: rawToolCall.function ? {
			...rawToolCall.function,
			arguments: normalizedArguments
		} : void 0
	};
}
function normalizeToolChoice(toolChoice) {
	if (toolChoice === void 0) return;
	if (toolChoice === "auto" || toolChoice === "none") return toolChoice;
	if (toolChoice === "any" || toolChoice === "required") {
		console.warn(`ChatAlibabaTongyi received tool_choice="${toolChoice}", which DashScope does not support directly. Falling back to "auto" (forced tool use is not guaranteed).`);
		return "auto";
	}
	if (typeof toolChoice === "string") return {
		type: "function",
		function: { name: toolChoice }
	};
	if (typeof toolChoice === "object" && toolChoice !== null) {
		if ("type" in toolChoice && toolChoice.type === "function" && "function" in toolChoice && typeof toolChoice.function === "object" && toolChoice.function !== null && "name" in toolChoice.function && typeof toolChoice.function.name === "string") return {
			type: "function",
			function: { name: toolChoice.function.name }
		};
		if ("type" in toolChoice && toolChoice.type === "tool" && "name" in toolChoice && typeof toolChoice.name === "string") return {
			type: "function",
			function: { name: toolChoice.name }
		};
		if ("type" in toolChoice && toolChoice.type === "auto") return "auto";
		if ("type" in toolChoice && toolChoice.type === "none") return "none";
	}
	throw new Error(`Unsupported tool_choice value for ChatAlibabaTongyi: ${JSON.stringify(toolChoice)}`);
}
function convertRawToolCallsToToolCallChunks(rawToolCalls) {
	return rawToolCalls.map((rawToolCall) => {
		const normalizedToolCall = normalizeToolCall(rawToolCall);
		return {
			type: "tool_call_chunk",
			id: normalizedToolCall.id,
			name: normalizedToolCall.function?.name,
			args: normalizedToolCall.function?.arguments,
			index: normalizedToolCall.index
		};
	});
}
function convertRawToolCallsToOpenAIToolCalls(rawToolCalls) {
	return rawToolCalls.map((rawToolCall, index) => {
		const normalizedToolCall = normalizeToolCall(rawToolCall);
		return {
			id: normalizedToolCall.id ?? `tool_call_${index}`,
			type: "function",
			function: {
				name: normalizedToolCall.function?.name ?? "",
				arguments: normalizedToolCall.function?.arguments ?? "{}"
			},
			index: normalizedToolCall.index
		};
	});
}
function mergeToolCallStringValue(previousValue, deltaValue) {
	if (deltaValue === void 0) return previousValue;
	if (previousValue === void 0) return deltaValue;
	if (deltaValue.startsWith(previousValue)) return deltaValue;
	if (previousValue.endsWith(deltaValue)) return previousValue;
	return `${previousValue}${deltaValue}`;
}
function mergeToolCallDelta(existingToolCall, deltaToolCall) {
	const existingArgs = normalizeToolCall(existingToolCall ?? {}).function?.arguments;
	const deltaArgs = normalizeToolCall(deltaToolCall).function?.arguments;
	const existingName = existingToolCall?.function?.name;
	const deltaName = deltaToolCall.function?.name;
	return {
		id: mergeToolCallStringValue(existingToolCall?.id, deltaToolCall.id),
		index: deltaToolCall.index ?? existingToolCall?.index,
		type: deltaToolCall.type ?? existingToolCall?.type,
		function: {
			name: mergeToolCallStringValue(existingName, deltaName),
			arguments: mergeToolCallStringValue(existingArgs, deltaArgs)
		}
	};
}
function getToolCallDeltaKey(toolCall, fallbackIndex) {
	if (toolCall.index !== void 0) return `index:${toolCall.index}`;
	if (toolCall.id) return `id:${toolCall.id}`;
	return `fallback:${fallbackIndex}`;
}
function applyToolCallDeltas(toolCallState, deltaToolCalls) {
	deltaToolCalls.forEach((deltaToolCall, index) => {
		const key = getToolCallDeltaKey(deltaToolCall, index);
		const mergedToolCall = mergeToolCallDelta(toolCallState.get(key), deltaToolCall);
		toolCallState.set(key, mergedToolCall);
	});
	return [...toolCallState.values()];
}
function parseRawToolCalls(rawToolCalls, partial = false) {
	const toolCalls = [];
	const invalidToolCalls = [];
	for (const rawToolCall of rawToolCalls) {
		const normalizedToolCall = normalizeToolCall(rawToolCall);
		try {
			const parsedToolCall = parseToolCall(normalizedToolCall, {
				returnId: true,
				partial
			});
			if (parsedToolCall) toolCalls.push(parsedToolCall);
		} catch (error) {
			const errorMessage = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "Failed to parse tool call";
			invalidToolCalls.push(makeInvalidToolCall(normalizedToolCall, errorMessage));
		}
	}
	return {
		toolCalls,
		invalidToolCalls
	};
}
function convertMessagesToTongyiParams(messages) {
	return messages.map((message) => {
		if (typeof message.content !== "string") throw new Error("ChatAlibabaTongyi only supports string message content. Complex content types (arrays, objects) are not supported.");
		const completionParam = {
			role: messageToTongyiRole(message),
			content: message.content
		};
		if (AIMessage.isInstance(message) && !!message.tool_calls?.length) {
			completionParam.tool_calls = message.tool_calls.map(convertLangChainToolCallToOpenAI);
			return completionParam;
		}
		if (message.additional_kwargs.tool_calls != null) completionParam.tool_calls = message.additional_kwargs.tool_calls;
		if (message.tool_call_id != null) completionParam.tool_call_id = message.tool_call_id;
		return completionParam;
	});
}
function extractOutputMessage(output) {
	if (!output) return {
		text: "",
		finishReason: void 0,
		rawToolCalls: []
	};
	if (output.choices?.length) {
		const firstChoice = output.choices[0];
		const choiceMessage = firstChoice.message ?? firstChoice.delta;
		return {
			text: choiceMessage?.content ?? "",
			finishReason: firstChoice.finish_reason ?? output.finish_reason,
			rawToolCalls: choiceMessage?.tool_calls ?? firstChoice.tool_calls ?? []
		};
	}
	return {
		text: output.text ?? "",
		finishReason: output.finish_reason,
		rawToolCalls: []
	};
}
function extractOutputFromStreamChunk(output) {
	if (!output) return {
		text: "",
		finishReason: void 0,
		rawToolCalls: []
	};
	if (output.choices?.length) {
		let text = "";
		let finishReason = output.finish_reason;
		const rawToolCalls = [];
		for (const choice of output.choices) {
			const choiceMessage = choice.delta ?? choice.message;
			text += choiceMessage?.content ?? "";
			if (choice.finish_reason) finishReason = choice.finish_reason;
			if (choiceMessage?.tool_calls?.length) rawToolCalls.push(...choiceMessage.tool_calls);
			else if (choice.tool_calls?.length) rawToolCalls.push(...choice.tool_calls);
		}
		return {
			text,
			finishReason,
			rawToolCalls
		};
	}
	return {
		text: output.text ?? "",
		finishReason: output.finish_reason,
		rawToolCalls: []
	};
}
/**
* Function that converts a base message to a Tongyi message role.
* @param message Base message to convert.
* @returns The Tongyi message role.
*/
function messageToTongyiRole(message) {
	const type = message._getType();
	switch (type) {
		case "ai": return "assistant";
		case "human": return "user";
		case "system": return "system";
		case "tool": return "tool";
		case "function": throw new Error("Function messages not supported");
		case "generic":
			if (!ChatMessage.isInstance(message)) throw new Error("Invalid generic chat message");
			return extractGenericMessageCustomRole(message);
		default: throw new Error(`Unknown message type: ${type}`);
	}
}
/**
* Wrapper around Ali Tongyi large language models that use the Chat endpoint.
*
* To use you should have the `ALIBABA_API_KEY`
* environment variable set.
*
* @augments BaseLLM
* @augments AlibabaTongyiChatInput
* @example
* ```typescript
* // Default - uses China region
* const qwen = new ChatAlibabaTongyi({
*   alibabaApiKey: "YOUR-API-KEY",
* });
*
* // Specify region explicitly
* const qwen = new ChatAlibabaTongyi({
*   model: "qwen-turbo",
*   temperature: 1,
*   region: "singapore", // or "us" or "china"
*   alibabaApiKey: "YOUR-API-KEY",
* });
*
* const messages = [new HumanMessage("Hello")];
*
* await qwen.call(messages);
* ```
*/
var ChatAlibabaTongyi = class extends BaseChatModel {
	static lc_name() {
		return "ChatAlibabaTongyi";
	}
	get callKeys() {
		return [
			"stop",
			"signal",
			"options",
			"tools",
			"tool_choice",
			"parallel_tool_calls",
			"parallelToolCalls"
		];
	}
	get lc_secrets() {
		return { alibabaApiKey: "ALIBABA_API_KEY" };
	}
	get lc_aliases() {}
	lc_serializable;
	alibabaApiKey;
	streaming;
	prefixMessages;
	modelName;
	model;
	apiUrl;
	maxTokens;
	temperature;
	topP;
	topK;
	repetitionPenalty;
	seed;
	enableSearch;
	parallelToolCalls;
	region;
	/**
	* Get the API URL based on the specified region.
	*
	* @param region - The region to get the URL for ('china', 'singapore', or 'us')
	* @returns The base URL for the specified region
	*/
	getRegionBaseUrl(region) {
		return {
			china: "https://dashscope.aliyuncs.com/",
			singapore: "https://dashscope-intl.aliyuncs.com/",
			us: "https://dashscope-us.aliyuncs.com/"
		}[region];
	}
	isMultimodalModel(modelName) {
		return /[-_]vl([-_.]|$)/i.test(modelName);
	}
	constructor(fields = {}) {
		super(fields);
		this.alibabaApiKey = fields?.alibabaApiKey ?? getEnvironmentVariable("ALIBABA_API_KEY");
		if (!this.alibabaApiKey) throw new Error("Ali API key not found");
		this.region = fields.region ?? getEnvironmentVariable("ALIBABA_REGION") ?? "china";
		this.modelName = fields?.model ?? fields.modelName ?? "qwen-turbo";
		this.model = this.modelName;
		if (fields.apiUrl) this.apiUrl = fields.apiUrl;
		else {
			const servicePath = this.isMultimodalModel(this.model) ? "api/v1/services/aigc/multimodal-generation/generation" : "api/v1/services/aigc/text-generation/generation";
			this.apiUrl = `${this.getRegionBaseUrl(this.region)}${servicePath}`;
		}
		this.lc_serializable = true;
		this.streaming = fields.streaming ?? false;
		this.prefixMessages = fields.prefixMessages ?? [];
		this.temperature = fields.temperature;
		this.topP = fields.topP;
		this.topK = fields.topK;
		this.seed = fields.seed;
		this.maxTokens = fields.maxTokens;
		this.repetitionPenalty = fields.repetitionPenalty;
		this.enableSearch = fields.enableSearch;
		this.parallelToolCalls = fields.parallelToolCalls;
	}
	/**
	* Get the parameters used to invoke the model
	*/
	invocationParams(options) {
		const tools = options?.tools?.map((tool) => convertToOpenAITool(tool)) ?? [];
		const parallelToolCalls = options?.parallel_tool_calls ?? options?.parallelToolCalls ?? this.parallelToolCalls;
		const hasTools = tools.length > 0;
		const parameters = {
			stream: this.streaming,
			temperature: this.temperature,
			top_p: this.topP,
			top_k: this.topK,
			seed: this.seed,
			max_tokens: this.maxTokens,
			result_format: hasTools ? "message" : "text",
			enable_search: this.enableSearch
		};
		if (hasTools) parameters.tools = tools;
		if (parallelToolCalls !== void 0) parameters.parallel_tool_calls = parallelToolCalls;
		const toolChoice = normalizeToolChoice(options?.tool_choice);
		if (toolChoice !== void 0) parameters.tool_choice = toolChoice;
		if (this.streaming) parameters.incremental_output = true;
		else parameters.repetition_penalty = this.repetitionPenalty;
		return parameters;
	}
	/**
	* Get the identifying parameters for the model
	*/
	identifyingParams() {
		return {
			model: this.model,
			...this.invocationParams()
		};
	}
	bindTools(tools, kwargs) {
		return this.withConfig({
			tools,
			...kwargs
		});
	}
	withStructuredOutput(outputSchema, config) {
		if (config?.strict) throw new Error(`"strict" mode is not supported for this model.`);
		const schema = outputSchema;
		const name = config?.name;
		const description = getSchemaDescription(schema) ?? "A function available to call.";
		const method = config?.method;
		const includeRaw = config?.includeRaw;
		if (method === "jsonMode") throw new Error(`ChatAlibabaTongyi only supports "functionCalling" for structured output.`);
		let functionName = name ?? "extract";
		const outputFormatSchema = isInteropZodSchema(schema) ? toJsonSchema(schema) : schema;
		let tools;
		if (isInteropZodSchema(schema)) tools = [{
			type: "function",
			function: {
				name: functionName,
				description,
				parameters: outputFormatSchema
			}
		}];
		else {
			if ("name" in schema && typeof schema.name === "string") functionName = schema.name;
			tools = [{
				type: "function",
				function: {
					name: functionName,
					description,
					parameters: schema
				}
			}];
		}
		const llm = this.bindTools(tools).withConfig({
			tool_choice: {
				type: "function",
				function: { name: functionName }
			},
			ls_structured_output_format: {
				kwargs: { method: "functionCalling" },
				schema: outputFormatSchema
			}
		});
		const outputParser = RunnableLambda.from((input) => {
			const toolCalls = input.tool_calls;
			if (!toolCalls || toolCalls.length === 0) throw new Error("No tool calls found in the response.");
			const toolCall = toolCalls.find((tc) => tc.name === functionName);
			if (!toolCall) throw new Error(`No tool call found with name ${functionName}.`);
			return toolCall.args;
		});
		if (!includeRaw) return llm.pipe(outputParser).withConfig({ runName: "StructuredOutput" });
		const parserAssign = RunnablePassthrough.assign({ parsed: (input, cfg) => outputParser.invoke(input.raw, cfg) });
		const parserNone = RunnablePassthrough.assign({ parsed: () => null });
		const parsedWithFallback = parserAssign.withFallbacks({ fallbacks: [parserNone] });
		return RunnableSequence.from([{ raw: llm }, parsedWithFallback]).withConfig({ runName: "StructuredOutputRunnable" });
	}
	/** @ignore */
	async _generate(messages, options, runManager) {
		const parameters = this.invocationParams(options);
		const messagesMapped = convertMessagesToTongyiParams(messages);
		const data = parameters.stream ? await new Promise((resolve, reject) => {
			let response;
			let concatenatedText = "";
			let mergedToolCalls = [];
			const streamedToolCallState = /* @__PURE__ */ new Map();
			let rejected = false;
			let resolved = false;
			this.completionWithRetry({
				model: this.model,
				parameters,
				input: { messages: messagesMapped }
			}, true, options?.signal, (event) => {
				const data = JSON.parse(event.data);
				if (data?.code) {
					if (rejected) return;
					rejected = true;
					reject(new Error(data?.message));
					return;
				}
				const { text, finishReason, rawToolCalls } = extractOutputFromStreamChunk(data.output);
				concatenatedText += text;
				mergedToolCalls = applyToolCallDeltas(streamedToolCallState, rawToolCalls);
				if (!response) response = {
					...data,
					output: {
						...data.output ?? {},
						text: concatenatedText,
						finish_reason: finishReason,
						choices: [{
							finish_reason: finishReason,
							message: {
								role: "assistant",
								content: concatenatedText,
								tool_calls: mergedToolCalls
							}
						}]
					}
				};
				else {
					response.output = {
						...response.output ?? {},
						text: concatenatedText,
						finish_reason: finishReason ?? response.output?.finish_reason,
						choices: [{
							finish_reason: finishReason ?? response.output?.finish_reason,
							message: {
								role: "assistant",
								content: concatenatedText,
								tool_calls: mergedToolCalls
							}
						}]
					};
					response.usage = data.usage;
				}
				runManager?.handleLLMNewToken(text ?? "");
				if (finishReason && finishReason !== "null") {
					if (resolved || rejected) return;
					resolved = true;
					resolve(response ?? {
						...data,
						output: {
							...data.output ?? {},
							text: concatenatedText,
							finish_reason: finishReason
						}
					});
				}
			}).then(() => {
				if (resolved || rejected) return;
				resolved = true;
				resolve(response ?? {
					usage: {
						input_tokens: 0,
						output_tokens: 0,
						total_tokens: 0
					},
					output: {
						text: concatenatedText,
						finish_reason: "null",
						choices: [{
							finish_reason: "null",
							message: {
								role: "assistant",
								content: concatenatedText,
								tool_calls: mergedToolCalls
							}
						}]
					}
				});
			}).catch((error) => {
				if (!rejected) {
					rejected = true;
					reject(error);
				}
			});
		}) : await this.completionWithRetry({
			model: this.model,
			parameters,
			input: { messages: messagesMapped }
		}, false, options?.signal).then((data) => {
			if (data?.code) throw new Error(data?.message);
			return data;
		});
		const { input_tokens = 0, output_tokens = 0, total_tokens = 0 } = data.usage ?? {};
		const usageMetadata = {
			input_tokens,
			output_tokens,
			total_tokens
		};
		const { text, finishReason, rawToolCalls } = extractOutputMessage(data.output);
		const requestId = data.request_id ?? data.requestId;
		const { toolCalls, invalidToolCalls } = parseRawToolCalls(rawToolCalls);
		return {
			generations: [{
				text,
				message: rawToolCalls.length > 0 ? new AIMessage({
					content: text,
					additional_kwargs: { tool_calls: convertRawToolCallsToOpenAIToolCalls(rawToolCalls) },
					tool_calls: toolCalls,
					invalid_tool_calls: invalidToolCalls,
					usage_metadata: usageMetadata,
					response_metadata: {
						model_provider: "alibaba_tongyi",
						model: this.model,
						request_id: requestId,
						...finishReason ? { finish_reason: finishReason } : {}
					}
				}) : new AIMessage({
					content: text,
					usage_metadata: usageMetadata,
					response_metadata: {
						model_provider: "alibaba_tongyi",
						model: this.model,
						request_id: requestId,
						...finishReason ? { finish_reason: finishReason } : {}
					}
				}),
				generationInfo: finishReason ? { finish_reason: finishReason } : void 0
			}],
			llmOutput: { tokenUsage: {
				promptTokens: input_tokens,
				completionTokens: output_tokens,
				totalTokens: total_tokens
			} }
		};
	}
	/** @ignore */
	async completionWithRetry(request, stream, signal, onmessage) {
		const makeCompletionRequest = async () => {
			const response = await fetch(this.apiUrl, {
				method: "POST",
				headers: {
					...stream ? {
						Accept: "text/event-stream",
						"X-DashScope-SSE": "enable"
					} : {},
					Authorization: `Bearer ${this.alibabaApiKey}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify(request),
				signal
			});
			if (!stream) return response.json();
			if (response.body) {
				if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
					onmessage?.(new MessageEvent("message", { data: await response.text() }));
					return;
				}
				const reader = response.body.getReader();
				const decoder = new TextDecoder("utf-8");
				let data = "";
				let continueReading = true;
				while (continueReading) {
					const { done, value } = await reader.read();
					if (done) {
						continueReading = false;
						break;
					}
					data += decoder.decode(value);
					let continueProcessing = true;
					while (continueProcessing) {
						const newlineIndex = data.indexOf("\n");
						if (newlineIndex === -1) {
							continueProcessing = false;
							break;
						}
						const line = data.slice(0, newlineIndex);
						data = data.slice(newlineIndex + 1);
						if (line.startsWith("data:")) {
							const event = new MessageEvent("message", { data: line.slice(5).trim() });
							onmessage?.(event);
						}
					}
				}
			}
		};
		return this.caller.call(makeCompletionRequest);
	}
	async *_streamResponseChunks(messages, options, runManager) {
		const parameters = {
			...this.invocationParams(options),
			stream: true,
			incremental_output: true
		};
		const messagesMapped = convertMessagesToTongyiParams(messages);
		const stream = await this.caller.call(async () => this.createTongyiStream({
			model: this.model,
			parameters,
			input: { messages: messagesMapped }
		}, options?.signal));
		for await (const chunk of stream) {
			if (!chunk.output && chunk.code) throw new Error(JSON.stringify(chunk));
			const { text, finishReason, rawToolCalls } = extractOutputFromStreamChunk(chunk.output);
			const toolCallChunks = convertRawToolCallsToToolCallChunks(rawToolCalls);
			const requestId = chunk.request_id ?? chunk.requestId;
			yield new ChatGenerationChunk({
				text,
				message: new AIMessageChunk({
					content: text,
					tool_call_chunks: toolCallChunks,
					usage_metadata: chunk.usage ? {
						input_tokens: chunk.usage.input_tokens ?? 0,
						output_tokens: chunk.usage.output_tokens ?? 0,
						total_tokens: chunk.usage.total_tokens ?? 0
					} : void 0,
					response_metadata: {
						model_provider: "alibaba_tongyi",
						model: this.model,
						request_id: requestId,
						...finishReason ? { finish_reason: finishReason } : {}
					}
				}),
				generationInfo: finishReason === "stop" || finishReason === "tool_calls" ? {
					finish_reason: finishReason,
					request_id: requestId,
					usage: chunk.usage
				} : void 0
			});
			await runManager?.handleLLMNewToken(text);
		}
	}
	async *createTongyiStream(request, signal) {
		const response = await fetch(this.apiUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.alibabaApiKey}`,
				Accept: "text/event-stream",
				"X-DashScope-SSE": "enable",
				"Content-Type": "application/json"
			},
			body: JSON.stringify(request),
			signal
		});
		if (!response.ok) {
			let error;
			const responseText = await response.text();
			try {
				const json = JSON.parse(responseText);
				error = /* @__PURE__ */ new Error(`Tongyi call failed with status code ${response.status}: ${json.error}`);
			} catch {
				error = /* @__PURE__ */ new Error(`Tongyi call failed with status code ${response.status}: ${responseText}`);
			}
			error.response = response;
			throw error;
		}
		if (!response.body) throw new Error("Could not begin Tongyi stream. Please check the given URL and try again.");
		const stream = IterableReadableStream.fromReadableStream(response.body);
		const decoder = new TextDecoder();
		let extra = "";
		for await (const chunk of stream) {
			const lines = (extra + decoder.decode(chunk)).split("\n");
			extra = lines.pop() || "";
			for (const line of lines) {
				if (!line.startsWith("data:")) continue;
				try {
					yield JSON.parse(line.slice(5).trim());
				} catch {
					console.warn(`Received a non-JSON parseable chunk: ${line}`);
				}
			}
		}
	}
	_llmType() {
		return "alibaba_tongyi";
	}
	/** @ignore */
	_combineLLMOutput() {
		return [];
	}
};
//#endregion
export { ChatAlibabaTongyi, alibaba_tongyi_exports };

//# sourceMappingURL=alibaba_tongyi.js.map