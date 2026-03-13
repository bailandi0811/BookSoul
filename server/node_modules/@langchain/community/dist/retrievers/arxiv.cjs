Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_arxiv = require('../utils/arxiv.cjs');
let _langchain_core_retrievers = require("@langchain/core/retrievers");

//#region src/retrievers/arxiv.ts
var arxiv_exports = /* @__PURE__ */ require_runtime.__exportAll({ ArxivRetriever: () => ArxivRetriever });
/**
* A retriever that searches arXiv for relevant articles based on a query.
* It can retrieve either full documents (PDFs) or just summaries.
*/
var ArxivRetriever = class extends _langchain_core_retrievers.BaseRetriever {
	static lc_name() {
		return "ArxivRetriever";
	}
	lc_namespace = [
		"langchain",
		"retrievers",
		"arxiv_retriever"
	];
	getFullDocuments = false;
	maxSearchResults = 10;
	constructor(options = {}) {
		super(options);
		this.getFullDocuments = options.getFullDocuments ?? this.getFullDocuments;
		this.maxSearchResults = options.maxSearchResults ?? this.maxSearchResults;
	}
	async _getRelevantDocuments(query) {
		try {
			const results = await require_arxiv.searchArxiv(query, this.maxSearchResults);
			if (this.getFullDocuments) return await require_arxiv.loadDocsFromResults(results);
			else return require_arxiv.getDocsFromSummaries(results);
		} catch {
			throw new Error(`Error retrieving documents from arXiv.`);
		}
	}
};

//#endregion
exports.ArxivRetriever = ArxivRetriever;
Object.defineProperty(exports, 'arxiv_exports', {
  enumerable: true,
  get: function () {
    return arxiv_exports;
  }
});
//# sourceMappingURL=arxiv.cjs.map