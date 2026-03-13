Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_core_retrievers = require("@langchain/core/retrievers");

//#region src/retrievers/metal.ts
var metal_exports = /* @__PURE__ */ require_runtime.__exportAll({ MetalRetriever: () => MetalRetriever });
/**
* Class used to interact with the Metal service, a managed retrieval &
* memory platform. It allows you to index your data into Metal and run
* semantic search and retrieval on it. It extends the `BaseRetriever`
* class and requires a `Metal` instance and a dictionary of parameters to
* pass to the Metal API during its initialization.
* @example
* ```typescript
* const retriever = new MetalRetriever({
*   client: new Metal(
*     process.env.METAL_API_KEY,
*     process.env.METAL_CLIENT_ID,
*     process.env.METAL_INDEX_ID,
*   ),
* });
* const docs = await retriever.getRelevantDocuments("hello");
* ```
*/
var MetalRetriever = class extends _langchain_core_retrievers.BaseRetriever {
	static lc_name() {
		return "MetalRetriever";
	}
	lc_namespace = [
		"langchain",
		"retrievers",
		"metal"
	];
	client;
	constructor(fields) {
		super(fields);
		this.client = fields.client;
	}
	async _getRelevantDocuments(query) {
		const res = await this.client.search({ text: query });
		return ("data" in res ? res.data : res).map(({ text, metadata }) => new _langchain_core_documents.Document({
			pageContent: text,
			metadata
		}));
	}
};

//#endregion
exports.MetalRetriever = MetalRetriever;
Object.defineProperty(exports, 'metal_exports', {
  enumerable: true,
  get: function () {
    return metal_exports;
  }
});
//# sourceMappingURL=metal.cjs.map