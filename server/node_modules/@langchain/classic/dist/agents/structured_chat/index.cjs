const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_agents_format_scratchpad_log = require('../format_scratchpad/log.cjs');
const require_agent = require('../agent.cjs');
const require_llm_chain = require('../../chains/llm_chain.cjs');
const require_prompt = require('./prompt.cjs');
const require_outputParser = require('./outputParser.cjs');
const require_tools_render = require('../../tools/render.cjs');
let _langchain_core_prompts = require("@langchain/core/prompts");
let _langchain_core_runnables = require("@langchain/core/runnables");
let _langchain_core_language_models_base = require("@langchain/core/language_models/base");
let _langchain_core_utils_function_calling = require("@langchain/core/utils/function_calling");
let _langchain_core_utils_types = require("@langchain/core/utils/types");
let _langchain_core_utils_json_schema = require("@langchain/core/utils/json_schema");

//#region src/agents/structured_chat/index.ts
/**
* Agent that interoperates with Structured Tools using React logic.
* @augments Agent
*/
var StructuredChatAgent = class StructuredChatAgent extends require_agent.Agent {
	static lc_name() {
		return "StructuredChatAgent";
	}
	lc_namespace = [
		"langchain",
		"agents",
		"structured_chat"
	];
	constructor(input) {
		const outputParser = input?.outputParser ?? StructuredChatAgent.getDefaultOutputParser();
		super({
			...input,
			outputParser
		});
	}
	_agentType() {
		return "structured-chat-zero-shot-react-description";
	}
	observationPrefix() {
		return "Observation: ";
	}
	llmPrefix() {
		return "Thought:";
	}
	_stop() {
		return ["Observation:"];
	}
	/**
	* Validates that all provided tools have a description. Throws an error
	* if any tool lacks a description.
	* @param tools Array of StructuredTool instances to validate.
	*/
	static validateTools(tools) {
		const descriptionlessTool = tools.find((tool) => !tool.description);
		if (descriptionlessTool) {
			const msg = `Got a tool ${descriptionlessTool.name} without a description. This agent requires descriptions for all tools.`;
			throw new Error(msg);
		}
	}
	/**
	* Returns a default output parser for the StructuredChatAgent. If an LLM
	* is provided, it creates an output parser with retry logic from the LLM.
	* @param fields Optional fields to customize the output parser. Can include an LLM and a list of tool names.
	* @returns An instance of StructuredChatOutputParserWithRetries.
	*/
	static getDefaultOutputParser(fields) {
		if (fields?.llm) return require_outputParser.StructuredChatOutputParserWithRetries.fromLLM(fields.llm, { toolNames: fields.toolNames });
		return new require_outputParser.StructuredChatOutputParserWithRetries({ toolNames: fields?.toolNames });
	}
	/**
	* Constructs the agent's scratchpad from a list of steps. If the agent's
	* scratchpad is not empty, it prepends a message indicating that the
	* agent has not seen any previous work.
	* @param steps Array of AgentStep instances to construct the scratchpad from.
	* @returns A Promise that resolves to a string representing the agent's scratchpad.
	*/
	async constructScratchPad(steps) {
		const agentScratchpad = await super.constructScratchPad(steps);
		if (agentScratchpad) return `This was your previous work (but I haven't seen any of it! I only see what you return as final answer):\n${agentScratchpad}`;
		return agentScratchpad;
	}
	/**
	* Creates a string representation of the schemas of the provided tools.
	* @param tools Array of StructuredTool instances to create the schemas string from.
	* @returns A string representing the schemas of the provided tools.
	*/
	static createToolSchemasString(tools) {
		return tools.map((tool) => {
			const jsonSchema = (0, _langchain_core_utils_types.isInteropZodSchema)(tool.schema) ? (0, _langchain_core_utils_json_schema.toJsonSchema)(tool.schema) : tool.schema;
			return `${tool.name}: ${tool.description}, args: ${JSON.stringify(jsonSchema?.properties)}`;
		}).join("\n");
	}
	/**
	* Create prompt in the style of the agent.
	*
	* @param tools - List of tools the agent will have access to, used to format the prompt.
	* @param args - Arguments to create the prompt with.
	* @param args.suffix - String to put after the list of tools.
	* @param args.prefix - String to put before the list of tools.
	* @param args.inputVariables List of input variables the final prompt will expect.
	* @param args.memoryPrompts List of historical prompts from memory.
	*/
	static createPrompt(tools, args) {
		const { prefix = require_prompt.PREFIX, suffix = require_prompt.SUFFIX, inputVariables = ["input", "agent_scratchpad"], humanMessageTemplate = "{input}\n\n{agent_scratchpad}", memoryPrompts = [] } = args ?? {};
		const messages = [
			new _langchain_core_prompts.SystemMessagePromptTemplate(new _langchain_core_prompts.PromptTemplate({
				template: [
					prefix,
					require_prompt.FORMAT_INSTRUCTIONS,
					suffix
				].join("\n\n"),
				inputVariables,
				partialVariables: {
					tool_schemas: StructuredChatAgent.createToolSchemasString(tools),
					tool_names: tools.map((tool) => tool.name).join(", ")
				}
			})),
			...memoryPrompts,
			new _langchain_core_prompts.HumanMessagePromptTemplate(new _langchain_core_prompts.PromptTemplate({
				template: humanMessageTemplate,
				inputVariables
			}))
		];
		return _langchain_core_prompts.ChatPromptTemplate.fromMessages(messages);
	}
	/**
	* Creates a StructuredChatAgent from an LLM and a list of tools.
	* Validates the tools, creates a prompt, and sets up an LLM chain for the
	* agent.
	* @param llm BaseLanguageModel instance to create the agent from.
	* @param tools Array of StructuredTool instances to create the agent from.
	* @param args Optional arguments to customize the creation of the agent. Can include arguments for creating the prompt and AgentArgs.
	* @returns A new instance of StructuredChatAgent.
	*/
	static fromLLMAndTools(llm, tools, args) {
		StructuredChatAgent.validateTools(tools);
		const prompt = StructuredChatAgent.createPrompt(tools, args);
		const outputParser = args?.outputParser ?? StructuredChatAgent.getDefaultOutputParser({
			llm,
			toolNames: tools.map((tool) => tool.name)
		});
		return new StructuredChatAgent({
			llmChain: new require_llm_chain.LLMChain({
				prompt,
				llm,
				callbacks: args?.callbacks
			}),
			outputParser,
			allowedTools: tools.map((t) => t.name)
		});
	}
};
/**
* Create an agent aimed at supporting tools with multiple inputs.
* @param params Params required to create the agent. Includes an LLM, tools, and prompt.
* @returns A runnable sequence representing an agent. It takes as input all the same input
*     variables as the prompt passed in does. It returns as output either an
*     AgentAction or AgentFinish.
*
* @example
* ```typescript
* import { AgentExecutor, createStructuredChatAgent } from "langchain/agents";
* import { pull } from "langchain/hub";
* import type { ChatPromptTemplate } from "@langchain/core/prompts";
* import { AIMessage, HumanMessage } from "@langchain/core/messages";
*
* import { ChatOpenAI } from "@langchain/openai";
*
* // Define the tools the agent will have access to.
* const tools = [...];
*
* // Get the prompt to use - you can modify this!
* // If you want to see the prompt in full, you can at:
* // https://smith.langchain.com/hub/hwchase17/structured-chat-agent
* const prompt = await pull<ChatPromptTemplate>(
*   "hwchase17/structured-chat-agent"
* );
*
* const llm = new ChatOpenAI({
*   temperature: 0,
*   model: "gpt-3.5-turbo-1106",
* });
*
* const agent = await createStructuredChatAgent({
*   llm,
*   tools,
*   prompt,
* });
*
* const agentExecutor = new AgentExecutor({
*   agent,
*   tools,
* });
*
* const result = await agentExecutor.invoke({
*   input: "what is LangChain?",
* });
*
* // With chat history
* const result2 = await agentExecutor.invoke({
*   input: "what's my name?",
*   chat_history: [
*     new HumanMessage("hi! my name is cob"),
*     new AIMessage("Hello Cob! How can I assist you today?"),
*   ],
* });
* ```
*/
async function createStructuredChatAgent({ llm, tools, prompt, streamRunnable }) {
	const missingVariables = [
		"tools",
		"tool_names",
		"agent_scratchpad"
	].filter((v) => !prompt.inputVariables.includes(v));
	if (missingVariables.length > 0) throw new Error(`Provided prompt is missing required input variables: ${JSON.stringify(missingVariables)}`);
	let toolNames = [];
	if (tools.every(_langchain_core_language_models_base.isOpenAITool)) toolNames = tools.map((tool) => tool.function.name);
	else if (tools.every(_langchain_core_utils_function_calling.isStructuredTool)) toolNames = tools.map((tool) => tool.name);
	else throw new Error("All tools must be either OpenAI or Structured tools, not a mix.");
	const partialedPrompt = await prompt.partial({
		tools: require_tools_render.renderTextDescriptionAndArgs(tools),
		tool_names: toolNames.join(", ")
	});
	const llmWithStop = llm.withConfig({ stop: ["Observation"] });
	return require_agent.AgentRunnableSequence.fromRunnables([
		_langchain_core_runnables.RunnablePassthrough.assign({ agent_scratchpad: (input) => require_agents_format_scratchpad_log.formatLogToString(input.steps) }),
		partialedPrompt,
		llmWithStop,
		require_outputParser.StructuredChatOutputParserWithRetries.fromLLM(llm, { toolNames })
	], {
		name: "StructuredChatAgent",
		streamRunnable,
		singleAction: true
	});
}

//#endregion
exports.StructuredChatAgent = StructuredChatAgent;
exports.createStructuredChatAgent = createStructuredChatAgent;
//# sourceMappingURL=index.cjs.map