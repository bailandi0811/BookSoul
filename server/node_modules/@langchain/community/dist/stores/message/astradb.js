import { __exportAll } from "../../_virtual/_rolldown/runtime.js";
import { mapChatMessagesToStoredMessages, mapStoredMessagesToChatMessages } from "@langchain/core/messages";
import { BaseListChatMessageHistory } from "@langchain/core/chat_history";
import { DataAPIClient } from "@datastax/astra-db-ts";

//#region src/stores/message/astradb.ts
var astradb_exports = /* @__PURE__ */ __exportAll({ AstraDBChatMessageHistory: () => AstraDBChatMessageHistory });
/**
* Class for storing chat message history with Astra DB. It extends the
* BaseListChatMessageHistory class and provides methods to get, add, and
* clear messages.
* @example
*
* ```typescript
* const client = new AstraDB(
*   process.env.ASTRA_DB_APPLICATION_TOKEN,
*   process.env.ASTRA_DB_ENDPOINT,
*   process.env.ASTRA_DB_NAMESPACE
* );
*
* const collection = await client.collection("test_chat");
*
* const chatHistory = new AstraDBChatMessageHistory({
*   collection,
*   sessionId: "YOUR_SESSION_ID",
* });
*
* const messages = await chatHistory.getMessages();
*
* await chatHistory.clear();
*/
var AstraDBChatMessageHistory = class AstraDBChatMessageHistory extends BaseListChatMessageHistory {
	lc_namespace = [
		"langchain",
		"stores",
		"message",
		"astradb"
	];
	sessionId;
	collection;
	constructor({ collection, sessionId }) {
		super();
		this.sessionId = sessionId;
		this.collection = collection;
	}
	/**
	* async initializer function to return a new instance of AstraDBChatMessageHistory in a single step
	* @param AstraDBChatMessageHistoryInput
	* @returns Promise<AstraDBChatMessageHistory>
	*
	* @example
	* const chatHistory = await AstraDBChatMessageHistory.initialize({
	*  token: process.env.ASTRA_DB_APPLICATION_TOKEN,
	*  endpoint: process.env.ASTRA_DB_ENDPOINT,
	*  namespace: process.env.ASTRA_DB_NAMESPACE,
	*  collectionName:"test_chat",
	*  sessionId: "YOUR_SESSION_ID"
	* });
	*/
	static async initialize({ token, endpoint, collectionName, namespace, sessionId }) {
		return new AstraDBChatMessageHistory({
			collection: await new DataAPIClient(token, { caller: ["langchainjs"] }).db(endpoint, { namespace }).collection(collectionName),
			sessionId
		});
	}
	async getMessages() {
		return mapStoredMessagesToChatMessages((await this.collection.find({ sessionId: this.sessionId }).toArray()).sort((a, b) => a.timestamp - b.timestamp).map((doc) => ({
			type: doc.type,
			data: doc.data
		})));
	}
	async addMessage(message) {
		const { type, data } = mapChatMessagesToStoredMessages([message])[0];
		await this.collection.insertOne({
			sessionId: this.sessionId,
			timestamp: Date.now(),
			type,
			data
		});
	}
	async clear() {
		await this.collection.deleteMany({ sessionId: this.sessionId });
	}
};

//#endregion
export { AstraDBChatMessageHistory, astradb_exports };
//# sourceMappingURL=astradb.js.map