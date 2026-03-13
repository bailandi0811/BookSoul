Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_classic_document_loaders_fs_text = require("@langchain/classic/document_loaders/fs/text");

//#region src/document_loaders/fs/chatgpt.ts
var chatgpt_exports = /* @__PURE__ */ require_runtime.__exportAll({ ChatGPTLoader: () => ChatGPTLoader });
function concatenateRows(message, title) {
	/**
	* Combine message information in a readable format ready to be used.
	* @param {ChatGPTMessage} message - Message to be concatenated
	* @param {string} title - Title of the conversation
	*
	* @returns {string} Concatenated message
	*/
	if (!message) return "";
	const sender = message.author ? message.author.role : "unknown";
	const text = message.content.parts[0];
	return `${title} - ${sender} on ${(/* @__PURE__ */ new Date(message.create_time * 1e3)).toISOString().slice(0, 19).replace("T", " ")}: ${text}\n\n`;
}
var ChatGPTLoader = class extends _langchain_classic_document_loaders_fs_text.TextLoader {
	numLogs;
	constructor(filePathOrBlob, numLogs = 0) {
		super(filePathOrBlob);
		this.numLogs = numLogs;
	}
	async parse(raw) {
		let data;
		try {
			data = JSON.parse(raw);
		} catch (e) {
			console.error(e);
			throw new Error("Failed to parse JSON");
		}
		return (this.numLogs > 0 ? data.slice(0, this.numLogs) : data).map((d) => Object.values(d.mapping).filter((msg, idx) => !(idx === 0 && msg.message.author.role === "system")).map((msg) => concatenateRows(msg.message, d.title)).join(""));
	}
	async load() {
		let text;
		let metadata;
		if (typeof this.filePathOrBlob === "string") {
			const { readFile } = await _langchain_classic_document_loaders_fs_text.TextLoader.imports();
			try {
				text = await readFile(this.filePathOrBlob, "utf8");
			} catch (e) {
				console.error(e);
				throw new Error("Failed to read file");
			}
			metadata = { source: this.filePathOrBlob };
		} else {
			try {
				text = await this.filePathOrBlob.text();
			} catch (e) {
				console.error(e);
				throw new Error("Failed to read blob");
			}
			metadata = {
				source: "blob",
				blobType: this.filePathOrBlob.type
			};
		}
		return (await this.parse(text)).map((pageContent, i) => new _langchain_core_documents.Document({
			pageContent,
			metadata: {
				...metadata,
				logIndex: i + 1
			}
		}));
	}
};

//#endregion
exports.ChatGPTLoader = ChatGPTLoader;
Object.defineProperty(exports, 'chatgpt_exports', {
  enumerable: true,
  get: function () {
    return chatgpt_exports;
  }
});
//# sourceMappingURL=chatgpt.cjs.map