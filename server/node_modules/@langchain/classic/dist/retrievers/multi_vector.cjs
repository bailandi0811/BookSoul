Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_storage_encoder_backed = require('../storage/encoder_backed.cjs');
let _langchain_core_retrievers = require("@langchain/core/retrievers");

//#region src/retrievers/multi_vector.ts
var multi_vector_exports = /* @__PURE__ */ require_runtime.__exportAll({ MultiVectorRetriever: () => MultiVectorRetriever });
/**
* A retriever that retrieves documents from a vector store and a document
* store. It uses the vector store to find relevant documents based on a
* query, and then retrieves the full documents from the document store.
* @example
* ```typescript
* const retriever = new MultiVectorRetriever({
*   vectorstore: new FaissStore(),
*   byteStore: new InMemoryStore<Unit8Array>(),
*   idKey: "doc_id",
*   childK: 20,
*   parentK: 5,
* });
*
* const retrieverResult = await retriever.invoke("justice breyer");
* console.log(retrieverResult[0].pageContent.length);
* ```
*/
var MultiVectorRetriever = class extends _langchain_core_retrievers.BaseRetriever {
	static lc_name() {
		return "MultiVectorRetriever";
	}
	lc_namespace = [
		"langchain",
		"retrievers",
		"multi_vector"
	];
	vectorstore;
	docstore;
	idKey;
	childK;
	parentK;
	constructor(args) {
		super(args);
		this.vectorstore = args.vectorstore;
		if (args.byteStore) this.docstore = require_storage_encoder_backed.createDocumentStoreFromByteStore(args.byteStore);
		else if (args.docstore) this.docstore = args.docstore;
		else throw new Error("byteStore and docstore are undefined. Please provide at least one.");
		this.idKey = args.idKey ?? "doc_id";
		this.childK = args.childK;
		this.parentK = args.parentK;
	}
	async _getRelevantDocuments(query) {
		const subDocs = await this.vectorstore.similaritySearch(query, this.childK);
		const ids = [];
		for (const doc of subDocs) if (doc.metadata[this.idKey] && !ids.includes(doc.metadata[this.idKey])) ids.push(doc.metadata[this.idKey]);
		return (await this.docstore.mget(ids)).filter((doc) => doc !== void 0).slice(0, this.parentK);
	}
};

//#endregion
exports.MultiVectorRetriever = MultiVectorRetriever;
Object.defineProperty(exports, 'multi_vector_exports', {
  enumerable: true,
  get: function () {
    return multi_vector_exports;
  }
});
//# sourceMappingURL=multi_vector.cjs.map