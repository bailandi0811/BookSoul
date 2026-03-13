Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_messages = require("@langchain/core/messages");
let convex_server = require("convex/server");
let _langchain_core_chat_history = require("@langchain/core/chat_history");

//#region src/stores/message/convex.ts
var convex_exports = /* @__PURE__ */ require_runtime.__exportAll({ ConvexChatMessageHistory: () => ConvexChatMessageHistory });
var ConvexChatMessageHistory = class extends _langchain_core_chat_history.BaseListChatMessageHistory {
	lc_namespace = [
		"langchain",
		"stores",
		"message",
		"convex"
	];
	ctx;
	sessionId;
	table;
	index;
	sessionIdField;
	messageTextFieldName;
	insert;
	lookup;
	deleteMany;
	constructor(config) {
		super();
		this.ctx = config.ctx;
		this.sessionId = config.sessionId;
		this.table = config.table ?? "messages";
		this.index = config.index ?? "bySessionId";
		this.sessionIdField = config.sessionIdField ?? "sessionId";
		this.messageTextFieldName = config.messageTextFieldName ?? "message";
		this.insert = config.insert ?? (0, convex_server.makeFunctionReference)("langchain/db:insert");
		this.lookup = config.lookup ?? (0, convex_server.makeFunctionReference)("langchain/db:lookup");
		this.deleteMany = config.deleteMany ?? (0, convex_server.makeFunctionReference)("langchain/db:deleteMany");
	}
	async getMessages() {
		return (0, _langchain_core_messages.mapStoredMessagesToChatMessages)((await this.ctx.runQuery(this.lookup, {
			table: this.table,
			index: this.index,
			keyField: this.sessionIdField,
			key: this.sessionId
		})).map((doc) => doc[this.messageTextFieldName]));
	}
	async addMessage(message) {
		const messages = (0, _langchain_core_messages.mapChatMessagesToStoredMessages)([message]);
		const PAGE_SIZE = 16;
		for (let i = 0; i < messages.length; i += PAGE_SIZE) await Promise.all(messages.slice(i, i + PAGE_SIZE).map((message) => this.ctx.runMutation(this.insert, {
			table: this.table,
			document: {
				[this.sessionIdField]: this.sessionId,
				[this.messageTextFieldName]: message
			}
		})));
	}
	async clear() {
		await this.ctx.runMutation(this.deleteMany, {
			table: this.table,
			index: this.index,
			keyField: this.sessionIdField,
			key: this.sessionId
		});
	}
};

//#endregion
exports.ConvexChatMessageHistory = ConvexChatMessageHistory;
Object.defineProperty(exports, 'convex_exports', {
  enumerable: true,
  get: function () {
    return convex_exports;
  }
});
//# sourceMappingURL=convex.cjs.map