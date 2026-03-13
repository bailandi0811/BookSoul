const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_memory_chat_memory = require('./chat_memory.cjs');
let _langchain_core_messages = require("@langchain/core/messages");

//#region src/memory/buffer_memory.ts
/**
* The `BufferMemory` class is a type of memory component used for storing
* and managing previous chat messages. It is a wrapper around
* `ChatMessageHistory` that extracts the messages into an input variable.
* This class is particularly useful in applications like chatbots where
* it is essential to remember previous interactions. Note: The memory
* instance represents the history of a single conversation. Therefore, it
* is not recommended to share the same history or memory instance between
* two different chains. If you deploy your LangChain app on a serverless
* environment, do not store memory instances in a variable, as your
* hosting provider may reset it by the next time the function is called.
* @example
* ```typescript
* // Initialize the memory to store chat history and set up the language model with a specific temperature.
* const memory = new BufferMemory({ memoryKey: "chat_history" });
* const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.9 });
*
* // Create a prompt template for a friendly conversation between a human and an AI.
* const prompt =
*   PromptTemplate.fromTemplate(`The following is a friendly conversation between a human and an AI. The AI is talkative and provides lots of specific details from its context. If the AI does not know the answer to a question, it truthfully says it does not know.
*
* Current conversation:
* {chat_history}
* Human: {input}
* AI:`);
*
* // Set up the chain with the language model, prompt, and memory.
* const chain = new LLMChain({ llm: model, prompt, memory });
*
* // Example usage of the chain to continue the conversation.
* // The `call` method sends the input to the model and returns the AI's response.
* const res = await chain.call({ input: "Hi! I'm Jim." });
* console.log({ res });
*
* ```
*/
var BufferMemory = class extends require_memory_chat_memory.BaseChatMemory {
	humanPrefix = "Human";
	aiPrefix = "AI";
	memoryKey = "history";
	constructor(fields) {
		super({
			chatHistory: fields?.chatHistory,
			returnMessages: fields?.returnMessages ?? false,
			inputKey: fields?.inputKey,
			outputKey: fields?.outputKey
		});
		this.humanPrefix = fields?.humanPrefix ?? this.humanPrefix;
		this.aiPrefix = fields?.aiPrefix ?? this.aiPrefix;
		this.memoryKey = fields?.memoryKey ?? this.memoryKey;
	}
	get memoryKeys() {
		return [this.memoryKey];
	}
	/**
	* Loads the memory variables. It takes an `InputValues` object as a
	* parameter and returns a `Promise` that resolves with a
	* `MemoryVariables` object.
	* @param _values `InputValues` object.
	* @returns A `Promise` that resolves with a `MemoryVariables` object.
	*/
	async loadMemoryVariables(_values) {
		const messages = await this.chatHistory.getMessages();
		if (this.returnMessages) return { [this.memoryKey]: messages };
		return { [this.memoryKey]: (0, _langchain_core_messages.getBufferString)(messages, this.humanPrefix, this.aiPrefix) };
	}
};

//#endregion
exports.BufferMemory = BufferMemory;
//# sourceMappingURL=buffer_memory.cjs.map