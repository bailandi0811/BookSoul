Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _getzep_zep_cloud = require("@getzep/zep-cloud");
let _getzep_zep_cloud_api = require("@getzep/zep-cloud/api");
let _langchain_core_retrievers = require("@langchain/core/retrievers");

//#region src/retrievers/zep_cloud.ts
var zep_cloud_exports = /* @__PURE__ */ require_runtime.__exportAll({ ZepCloudRetriever: () => ZepCloudRetriever });
/**
* Class for retrieving information from a Zep Cloud long-term memory store.
* Extends the BaseRetriever class.
* @example
* ```typescript
* const retriever = new ZepCloudRetriever({
*   apiKey: "<zep cloud project api key>",
*   sessionId: "session_exampleUUID",
*   topK: 3,
* });
* const query = "Can I drive red cars in France?";
* const docs = await retriever.getRelevantDocuments(query);
* ```
*/
var ZepCloudRetriever = class extends _langchain_core_retrievers.BaseRetriever {
	static lc_name() {
		return "ZepRetriever";
	}
	lc_namespace = [
		"langchain",
		"retrievers",
		"zep"
	];
	get lc_secrets() {
		return { apiKey: "ZEP_API_KEY" };
	}
	get lc_aliases() {
		return { apiKey: "api_key" };
	}
	client;
	sessionId;
	topK;
	searchScope;
	searchType;
	mmrLambda;
	filter;
	constructor(config) {
		super(config);
		this.sessionId = config.sessionId;
		this.topK = config.topK;
		this.searchScope = config.searchScope;
		this.searchType = config.searchType;
		this.mmrLambda = config.mmrLambda;
		this.filter = config.filter;
		this.client = new _getzep_zep_cloud.ZepClient({ apiKey: config.apiKey });
	}
	/**
	*  Converts an array of message search results to an array of Document objects.
	*  @param {MemorySearchResult[]} results - The array of search results.
	*  @returns {Document[]} An array of Document objects representing the search results.
	*/
	searchMessageResultToDoc(results) {
		return results.filter((r) => r.message).map(({ message: { content, metadata: messageMetadata } = {}, score, ...rest }) => new _langchain_core_documents.Document({
			pageContent: content ?? "",
			metadata: {
				score,
				...messageMetadata,
				...rest
			}
		}));
	}
	/**
	*  Converts an array of summary search results to an array of Document objects.
	*  @param {MemorySearchResult[]} results - The array of search results.
	*  @returns {Document[]} An array of Document objects representing the search results.
	*/
	searchSummaryResultToDoc(results) {
		return results.filter((r) => r.summary).map(({ summary: { content, metadata: summaryMetadata } = {}, score, ...rest }) => new _langchain_core_documents.Document({
			pageContent: content ?? "",
			metadata: {
				score,
				...summaryMetadata,
				...rest
			}
		}));
	}
	/**
	*  Retrieves the relevant documents based on the given query.
	*  @param {string} query - The query string.
	*  @returns {Promise<Document[]>} A promise that resolves to an array of relevant Document objects.
	*/
	async _getRelevantDocuments(query) {
		try {
			const results = await this.client.memory.search(this.sessionId, {
				text: query,
				metadata: this.filter,
				searchScope: this.searchScope,
				searchType: this.searchType,
				mmrLambda: this.mmrLambda,
				limit: this.topK
			});
			return this.searchScope === "summary" ? this.searchSummaryResultToDoc(results) : this.searchMessageResultToDoc(results);
		} catch (error) {
			if (error instanceof _getzep_zep_cloud_api.NotFoundError) return Promise.resolve([]);
			throw error;
		}
	}
};

//#endregion
exports.ZepCloudRetriever = ZepCloudRetriever;
Object.defineProperty(exports, 'zep_cloud_exports', {
  enumerable: true,
  get: function () {
    return zep_cloud_exports;
  }
});
//# sourceMappingURL=zep_cloud.cjs.map