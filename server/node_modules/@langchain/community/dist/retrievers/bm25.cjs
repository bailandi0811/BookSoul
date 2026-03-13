Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_BM25 = require('../utils/@furkantoprak/bm25/BM25.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_core_retrievers = require("@langchain/core/retrievers");

//#region src/retrievers/bm25.ts
var bm25_exports = /* @__PURE__ */ require_runtime.__exportAll({ BM25Retriever: () => BM25Retriever });
/**
* A retriever that uses the BM25 algorithm to rank documents based on their
* similarity to a query. It uses the "okapibm25" package for BM25 scoring.
* The k parameter determines the number of documents to return for each query.
*/
var BM25Retriever = class extends _langchain_core_retrievers.BaseRetriever {
	includeScore = false;
	static lc_name() {
		return "BM25Retriever";
	}
	lc_namespace = [
		"langchain",
		"retrievers",
		"bm25_retriever"
	];
	static fromDocuments(documents, options) {
		return new this({
			...options,
			docs: documents
		});
	}
	docs;
	k;
	constructor(options) {
		super(options);
		this.docs = options.docs;
		this.k = options.k;
		this.includeScore = options.includeScore ?? this.includeScore;
	}
	preprocessFunc(text) {
		return text.toLowerCase().split(/\s+/);
	}
	async _getRelevantDocuments(query) {
		const processedQuery = this.preprocessFunc(query);
		return require_BM25.BM25(this.docs.map((d) => ({
			text: d.pageContent,
			document: d
		})), processedQuery, void 0, (a, b) => b.score - a.score).slice(0, this.k).map((item) => {
			if (this.includeScore) return new _langchain_core_documents.Document({
				...item.document.id && { id: item.document.id },
				pageContent: item.document.pageContent,
				metadata: {
					bm25Score: item.score,
					...item.document.metadata
				}
			});
			else return item.document;
		});
	}
};

//#endregion
exports.BM25Retriever = BM25Retriever;
Object.defineProperty(exports, 'bm25_exports', {
  enumerable: true,
  get: function () {
    return bm25_exports;
  }
});
//# sourceMappingURL=bm25.cjs.map