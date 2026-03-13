import { __exportAll } from "../../_virtual/_rolldown/runtime.js";
import { AsyncCaller } from "@langchain/core/utils/async_caller";
import { Document } from "@langchain/core/documents";
import { BaseDocumentLoader } from "@langchain/core/document_loaders/base";

//#region src/document_loaders/web/html.ts
var html_exports = /* @__PURE__ */ __exportAll({ HTMLWebBaseLoader: () => HTMLWebBaseLoader });
var HTMLWebBaseLoader = class extends BaseDocumentLoader {
	timeout;
	caller;
	textDecoder;
	headers;
	constructor(webPath, fields) {
		super();
		this.webPath = webPath;
		const { timeout, textDecoder, headers, ...rest } = fields ?? {};
		this.timeout = timeout ?? 1e4;
		this.caller = new AsyncCaller(rest);
		this.textDecoder = textDecoder;
		this.headers = headers;
	}
	async load() {
		const response = await this.caller.call(fetch, this.webPath, {
			signal: this.timeout ? AbortSignal.timeout(this.timeout) : void 0,
			headers: this.headers
		});
		return [new Document({ pageContent: this.textDecoder?.decode(await response.arrayBuffer()) ?? await response.text() })];
	}
};

//#endregion
export { HTMLWebBaseLoader, html_exports };
//# sourceMappingURL=html.js.map