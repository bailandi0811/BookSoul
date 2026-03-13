Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_async_caller = require("@langchain/core/utils/async_caller");
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");

//#region src/document_loaders/web/html.ts
var html_exports = /* @__PURE__ */ require_runtime.__exportAll({ HTMLWebBaseLoader: () => HTMLWebBaseLoader });
var HTMLWebBaseLoader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	timeout;
	caller;
	textDecoder;
	headers;
	constructor(webPath, fields) {
		super();
		this.webPath = webPath;
		const { timeout, textDecoder, headers, ...rest } = fields ?? {};
		this.timeout = timeout ?? 1e4;
		this.caller = new _langchain_core_utils_async_caller.AsyncCaller(rest);
		this.textDecoder = textDecoder;
		this.headers = headers;
	}
	async load() {
		const response = await this.caller.call(fetch, this.webPath, {
			signal: this.timeout ? AbortSignal.timeout(this.timeout) : void 0,
			headers: this.headers
		});
		return [new _langchain_core_documents.Document({ pageContent: this.textDecoder?.decode(await response.arrayBuffer()) ?? await response.text() })];
	}
};

//#endregion
exports.HTMLWebBaseLoader = HTMLWebBaseLoader;
Object.defineProperty(exports, 'html_exports', {
  enumerable: true,
  get: function () {
    return html_exports;
  }
});
//# sourceMappingURL=html.cjs.map