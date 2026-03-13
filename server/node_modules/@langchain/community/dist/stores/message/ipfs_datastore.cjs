Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_messages = require("@langchain/core/messages");
let _langchain_core_chat_history = require("@langchain/core/chat_history");
let cborg = require("cborg");
cborg = require_runtime.__toESM(cborg);
let interface_datastore = require("interface-datastore");
let it_all = require("it-all");
it_all = require_runtime.__toESM(it_all);

//#region src/stores/message/ipfs_datastore.ts
var ipfs_datastore_exports = /* @__PURE__ */ require_runtime.__exportAll({ IPFSDatastoreChatMessageHistory: () => IPFSDatastoreChatMessageHistory });
var IPFSDatastoreChatMessageHistory = class extends _langchain_core_chat_history.BaseListChatMessageHistory {
	lc_namespace = [
		"langchain",
		"stores",
		"message",
		"datastore"
	];
	sessionId;
	datastore;
	constructor({ datastore, sessionId }) {
		super({ sessionId });
		this.datastore = datastore;
		this.sessionId = sessionId;
	}
	async getMessages() {
		return (0, _langchain_core_messages.mapStoredMessagesToChatMessages)((await (0, it_all.default)(this.datastore.query({ prefix: `/${this.sessionId}` }))).map((d) => cborg.decode(d.value)));
	}
	async addMessage(message) {
		await this.addMessages([message]);
	}
	async addMessages(messages) {
		const { length } = await (0, it_all.default)(this.datastore.queryKeys({ prefix: `/${this.sessionId}` }));
		const pairs = (0, _langchain_core_messages.mapChatMessagesToStoredMessages)(messages).map((message, index) => ({
			key: new interface_datastore.Key(`/${this.sessionId}/${index + length}`),
			value: cborg.encode(message)
		}));
		await (0, it_all.default)(this.datastore.putMany(pairs));
	}
	async clear() {
		const keys = this.datastore.queryKeys({ prefix: `/${this.sessionId}` });
		await (0, it_all.default)(this.datastore.deleteMany(keys));
	}
};

//#endregion
exports.IPFSDatastoreChatMessageHistory = IPFSDatastoreChatMessageHistory;
Object.defineProperty(exports, 'ipfs_datastore_exports', {
  enumerable: true,
  get: function () {
    return ipfs_datastore_exports;
  }
});
//# sourceMappingURL=ipfs_datastore.cjs.map