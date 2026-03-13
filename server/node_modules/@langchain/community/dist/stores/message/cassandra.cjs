Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_utils_cassandra = require('../../utils/cassandra.cjs');
let _langchain_core_messages = require("@langchain/core/messages");
let _langchain_core_chat_history = require("@langchain/core/chat_history");

//#region src/stores/message/cassandra.ts
var cassandra_exports = /* @__PURE__ */ require_runtime.__exportAll({ CassandraChatMessageHistory: () => CassandraChatMessageHistory });
/**
* Class for storing chat message history within Cassandra. It extends the
* BaseListChatMessageHistory class and provides methods to get, add, and
* clear messages.
* @example
* ```typescript
* const chatHistory = new CassandraChatMessageHistory({
*   cloud: {
*     secureConnectBundle: "<path to your secure bundle>",
*   },
*   credentials: {
*     username: "token",
*     password: "<your Cassandra access token>",
*   },
*   keyspace: "langchain",
*   table: "message_history",
*   sessionId: "<some unique session identifier>",
* });
*
* const chain = new ConversationChain({
*   llm: new ChatOpenAI({ model: "gpt-4o-mini" }),
*   memory: chatHistory,
* });
*
* const response = await chain.invoke({
*   input: "What did I just say my name was?",
* });
* console.log({ response });
* ```
*/
var CassandraChatMessageHistory = class extends _langchain_core_chat_history.BaseListChatMessageHistory {
	lc_namespace = [
		"langchain",
		"stores",
		"message",
		"cassandra"
	];
	cassandraTable;
	sessionId;
	options;
	colSessionId;
	colMessageTs;
	colMessageType;
	colData;
	constructor(options) {
		super();
		this.sessionId = options.sessionId;
		this.options = options;
		this.colSessionId = {
			name: "session_id",
			type: "text",
			partition: true
		};
		this.colMessageTs = {
			name: "message_ts",
			type: "timestamp"
		};
		this.colMessageType = {
			name: "message_type",
			type: "text"
		};
		this.colData = {
			name: "data",
			type: "text"
		};
	}
	/**
	* Method to get all the messages stored in the Cassandra database.
	* @returns Array of stored BaseMessage instances.
	*/
	async getMessages() {
		await this.ensureTable();
		return (0, _langchain_core_messages.mapStoredMessagesToChatMessages)((await this.cassandraTable.select([this.colMessageType, this.colData], [{
			name: "session_id",
			value: this.sessionId
		}])).rows.map((row) => ({
			type: row.message_type,
			data: JSON.parse(row.data)
		})));
	}
	/**
	* Method to add a new message to the Cassandra database.
	* @param message The BaseMessage instance to add.
	* @returns A promise that resolves when the message has been added.
	*/
	async addMessage(message) {
		await this.ensureTable();
		const { type, data } = (0, _langchain_core_messages.mapChatMessagesToStoredMessages)([message])[0];
		return this.cassandraTable.upsert([[
			this.sessionId,
			type,
			Date.now(),
			JSON.stringify(data)
		]], [
			this.colSessionId,
			this.colMessageType,
			this.colMessageTs,
			this.colData
		]).then(() => {});
	}
	/**
	* Method to clear all the messages from the Cassandra database.
	* @returns A promise that resolves when all messages have been cleared.
	*/
	async clear() {
		await this.ensureTable();
		return this.cassandraTable.delete({
			name: this.colSessionId.name,
			value: this.sessionId
		}).then(() => {});
	}
	/**
	* Method to initialize the Cassandra database.
	* @returns Promise that resolves when the database has been initialized.
	*/
	async ensureTable() {
		if (this.cassandraTable) return;
		this.cassandraTable = await new require_utils_cassandra.CassandraTable({
			...this.options,
			primaryKey: [this.colSessionId, this.colMessageTs],
			nonKeyColumns: [this.colMessageType, this.colData]
		});
	}
};

//#endregion
exports.CassandraChatMessageHistory = CassandraChatMessageHistory;
Object.defineProperty(exports, 'cassandra_exports', {
  enumerable: true,
  get: function () {
    return cassandra_exports;
  }
});
//# sourceMappingURL=cassandra.cjs.map