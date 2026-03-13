Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_chat_history = require("@langchain/core/chat_history");
let _langchain_core_memory = require("@langchain/core/memory");

//#region src/memory/chat_memory.ts
var chat_memory_exports = /* @__PURE__ */ require_runtime.__exportAll({ BaseChatMemory: () => BaseChatMemory });
/**
* Abstract class that provides a base for implementing different types of
* memory systems. It is designed to maintain the state of an application,
* specifically the history of a conversation. This class is typically
* extended by other classes to create specific types of memory systems.
*/
var BaseChatMemory = class extends _langchain_core_memory.BaseMemory {
	chatHistory;
	returnMessages = false;
	inputKey;
	outputKey;
	constructor(fields) {
		super();
		this.chatHistory = fields?.chatHistory ?? new _langchain_core_chat_history.InMemoryChatMessageHistory();
		this.returnMessages = fields?.returnMessages ?? this.returnMessages;
		this.inputKey = fields?.inputKey ?? this.inputKey;
		this.outputKey = fields?.outputKey ?? this.outputKey;
	}
	/**
	* Method to add user and AI messages to the chat history in sequence.
	* @param inputValues The input values from the user.
	* @param outputValues The output values from the AI.
	* @returns Promise that resolves when the context has been saved.
	*/
	async saveContext(inputValues, outputValues) {
		await this.chatHistory.addUserMessage((0, _langchain_core_memory.getInputValue)(inputValues, this.inputKey));
		await this.chatHistory.addAIMessage((0, _langchain_core_memory.getOutputValue)(outputValues, this.outputKey));
	}
	/**
	* Method to clear the chat history.
	* @returns Promise that resolves when the chat history has been cleared.
	*/
	async clear() {
		await this.chatHistory.clear();
	}
};

//#endregion
exports.BaseChatMemory = BaseChatMemory;
Object.defineProperty(exports, 'chat_memory_exports', {
  enumerable: true,
  get: function () {
    return chat_memory_exports;
  }
});
//# sourceMappingURL=chat_memory.cjs.map