import { BaseLanguageModelInput, StructuredOutputMethodOptions, ToolDefinition } from "@langchain/core/language_models/base";
import { InteropZodType } from "@langchain/core/utils/types";
import { BaseChatModel, BaseChatModelCallOptions, BaseChatModelParams, BindToolsInput } from "@langchain/core/language_models/chat_models";
import { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { AIMessage, AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { Runnable } from "@langchain/core/runnables";

//#region src/chat_models/alibaba_tongyi.d.ts
/**
 * Type representing the role of a message in the Tongyi chat model.
 */
type TongyiMessageRole = "system" | "assistant" | "user" | "tool";
/**
 * Interface representing a message in the Tongyi chat model.
 */
interface TongyiToolCall {
  id?: string;
  type?: string;
  index?: number;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}
interface TongyiMessage {
  role: TongyiMessageRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: TongyiToolCall[];
}
type TongyiToolChoice = "auto" | "none" | {
  type: "function";
  function: {
    name: string;
  };
};
/**
 * Interface representing a request for a chat completion.
 *
 * See https://help.aliyun.com/zh/dashscope/developer-reference/model-square/
 */
interface ChatCompletionRequest {
  model: (string & NonNullable<unknown>) | "qwen-turbo" | "qwen-plus" | "qwen-max" | "qwen-max-1201" | "qwen-max-longcontext" | "qwen-7b-chat" | "qwen-14b-chat" | "qwen-72b-chat" | "llama2-7b-chat-v2" | "llama2-13b-chat-v2" | "baichuan-7b-v1" | "baichuan2-13b-chat-v1" | "baichuan2-7b-chat-v1" | "chatglm3-6b" | "chatglm-6b-v2";
  input: {
    messages: TongyiMessage[];
  };
  parameters: {
    stream?: boolean;
    result_format?: "text" | "message";
    seed?: number | null;
    max_tokens?: number | null;
    top_p?: number | null;
    top_k?: number | null;
    repetition_penalty?: number | null;
    temperature?: number | null;
    enable_search?: boolean | null;
    incremental_output?: boolean | null;
    parallel_tool_calls?: boolean | null;
    tools?: ToolDefinition[];
    tool_choice?: TongyiToolChoice;
  };
}
interface ChatAlibabaTongyiCallOptions extends BaseChatModelCallOptions {
  tools?: BindToolsInput[];
  parallel_tool_calls?: boolean;
  parallelToolCalls?: boolean;
}
/**
 * Interface defining the input to the ChatAlibabaTongyi class.
 */
interface AlibabaTongyiChatInput {
  /**
   * Model name to use. Available options are: qwen-turbo, qwen-plus, qwen-max, or Other compatible models.
   * Alias for `model`
   * @default "qwen-turbo"
   */
  modelName: string;
  /** Model name to use. Available options are: qwen-turbo, qwen-plus, qwen-max, or Other compatible models.
   * @default "qwen-turbo"
   */
  model: string;
  /** Whether to stream the results or not. Defaults to false. */
  streaming?: boolean;
  /** Messages to pass as a prefix to the prompt */
  prefixMessages?: TongyiMessage[];
  /**
   * API key to use when making requests. Defaults to the value of
   * `ALIBABA_API_KEY` environment variable.
   */
  alibabaApiKey?: string;
  /**
   * Region for the Alibaba Tongyi API endpoint.
   *
   * Available base URLs (used with `/api/v1/services/aigc/text-generation/generation`):
   * - 'china' (default): https://dashscope.aliyuncs.com/
   * - 'singapore': https://dashscope-intl.aliyuncs.com/
   * - 'us': https://dashscope-us.aliyuncs.com/
   *
   * @default "china"
   */
  region?: "china" | "singapore" | "us";
  /** Amount of randomness injected into the response. Ranges
   * from 0 to 1 (0 is not included). Use temp closer to 0 for analytical /
   * multiple choice, and temp closer to 1 for creative
   * and generative tasks. Defaults to 0.95.
   */
  temperature?: number;
  /** Total probability mass of tokens to consider at each step. Range
   * from 0 to 1.0. Defaults to 0.8.
   */
  topP?: number;
  topK?: number;
  enableSearch?: boolean;
  maxTokens?: number;
  seed?: number;
  /** Penalizes repeated tokens according to frequency. Range
   * from 1.0 to 2.0. Defaults to 1.0.
   */
  repetitionPenalty?: number;
  /** Experimental passthrough to allow parallel tool calls. */
  parallelToolCalls?: boolean;
  /** Custom API URL. Overrides auto-detected URL based on region and model type.
   * If not provided, text models use the text-generation endpoint and
   * VL (vision-language) models use the multimodal-generation endpoint.
   */
  apiUrl?: string;
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
declare class ChatAlibabaTongyi extends BaseChatModel<ChatAlibabaTongyiCallOptions> implements AlibabaTongyiChatInput {
  static lc_name(): string;
  get callKeys(): string[];
  get lc_secrets(): {
    alibabaApiKey: string;
  };
  get lc_aliases(): undefined;
  lc_serializable: boolean;
  alibabaApiKey?: string;
  streaming: boolean;
  prefixMessages?: TongyiMessage[];
  modelName: ChatCompletionRequest["model"];
  model: ChatCompletionRequest["model"];
  apiUrl: string;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  topP?: number | undefined;
  topK?: number | undefined;
  repetitionPenalty?: number | undefined;
  seed?: number | undefined;
  enableSearch?: boolean | undefined;
  parallelToolCalls?: boolean | undefined;
  region: "china" | "singapore" | "us";
  /**
   * Get the API URL based on the specified region.
   *
   * @param region - The region to get the URL for ('china', 'singapore', or 'us')
   * @returns The base URL for the specified region
   */
  private getRegionBaseUrl;
  private isMultimodalModel;
  constructor(fields?: Partial<AlibabaTongyiChatInput> & BaseChatModelParams);
  /**
   * Get the parameters used to invoke the model
   */
  invocationParams(options?: this["ParsedCallOptions"]): ChatCompletionRequest["parameters"];
  /**
   * Get the identifying parameters for the model
   */
  identifyingParams(): ChatCompletionRequest["parameters"] & Pick<ChatCompletionRequest, "model">;
  bindTools(tools: BindToolsInput[], kwargs?: Partial<ChatAlibabaTongyiCallOptions>): Runnable<BaseLanguageModelInput, AIMessageChunk, ChatAlibabaTongyiCallOptions>;
  withStructuredOutput<RunOutput extends Record<string, any> = Record<string, any>>(outputSchema: InteropZodType<RunOutput> | Record<string, any>, config?: StructuredOutputMethodOptions<false>): Runnable<BaseLanguageModelInput, RunOutput>;
  withStructuredOutput<RunOutput extends Record<string, any> = Record<string, any>>(outputSchema: InteropZodType<RunOutput> | Record<string, any>, config?: StructuredOutputMethodOptions<true>): Runnable<BaseLanguageModelInput, {
    raw: AIMessage | AIMessageChunk;
    parsed: RunOutput;
  }>;
  /** @ignore */
  _generate(messages: BaseMessage[], options?: this["ParsedCallOptions"], runManager?: CallbackManagerForLLMRun): Promise<ChatResult>;
  /** @ignore */
  completionWithRetry(request: ChatCompletionRequest, stream: boolean, signal?: AbortSignal, onmessage?: (event: MessageEvent) => void): Promise<any>;
  _streamResponseChunks(messages: BaseMessage[], options?: this["ParsedCallOptions"], runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk>;
  private createTongyiStream;
  _llmType(): string;
  /** @ignore */
  _combineLLMOutput(): never[];
}
//#endregion
export { ChatAlibabaTongyi, ChatAlibabaTongyiCallOptions, TongyiMessageRole };
//# sourceMappingURL=alibaba_tongyi.d.cts.map