Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_env = require("@langchain/core/utils/env");
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");
let _mendable_firecrawl_js = require("@mendable/firecrawl-js");
_mendable_firecrawl_js = require_runtime.__toESM(_mendable_firecrawl_js);

//#region src/document_loaders/web/firecrawl.ts
var firecrawl_exports = /* @__PURE__ */ require_runtime.__exportAll({ FireCrawlLoader: () => FireCrawlLoader });
/**
* Class representing a document loader for loading data from
* Firecrawl (firecrawl.dev). It extends the BaseDocumentLoader class.
* @example
* ```typescript
* const loader = new FireCrawlLoader({
*   url: "{url}",
*   apiKey: "{apiKey}",
*   mode: "crawl"
* });
* const docs = await loader.load();
* ```
*/
var FireCrawlLoader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	apiKey;
	apiUrl;
	url;
	mode;
	params;
	constructor(loaderParams) {
		super();
		const { apiKey = (0, _langchain_core_utils_env.getEnvironmentVariable)("FIRECRAWL_API_KEY"), apiUrl, url, mode = "crawl", params } = loaderParams;
		if (!apiKey) throw new Error("Firecrawl API key not set. You can set it as FIRECRAWL_API_KEY in your .env file, or pass it to Firecrawl.");
		this.apiKey = apiKey;
		this.apiUrl = apiUrl;
		this.url = url;
		this.mode = mode;
		this.params = params;
	}
	/**
	* Loads data from Firecrawl.
	* @returns An array of Documents representing the retrieved data.
	* @throws An error if the data could not be loaded.
	*/
	async load() {
		const params = { apiKey: this.apiKey };
		if (this.apiUrl !== void 0) params.apiUrl = this.apiUrl;
		const app = new _mendable_firecrawl_js.default(params);
		let firecrawlDocs;
		if (this.mode === "scrape") {
			const response = await app.scrapeUrl(this.url, this.params);
			if (!response.success) throw new Error(`Firecrawl: Failed to scrape URL. Error: ${response.error}`);
			firecrawlDocs = [response];
		} else if (this.mode === "crawl") {
			const response = await app.crawlUrl(this.url, this.params);
			if (!response.success) throw new Error(`Firecrawl: Failed to crawl URL. Error: ${response.error}`);
			firecrawlDocs = response.data;
		} else if (this.mode === "map") {
			const response = await app.mapUrl(this.url, this.params);
			if (!response.success) throw new Error(`Firecrawl: Failed to map URL. Error: ${response.error}`);
			firecrawlDocs = response.links;
			return firecrawlDocs.map((doc) => new _langchain_core_documents.Document({ pageContent: JSON.stringify(doc) }));
		} else throw new Error(`Unrecognized mode '${this.mode}'. Expected one of 'crawl', 'scrape'.`);
		return firecrawlDocs.map((doc) => new _langchain_core_documents.Document({
			pageContent: doc.markdown || doc.html || doc.rawHtml || "",
			metadata: doc.metadata || {}
		}));
	}
};

//#endregion
exports.FireCrawlLoader = FireCrawlLoader;
Object.defineProperty(exports, 'firecrawl_exports', {
  enumerable: true,
  get: function () {
    return firecrawl_exports;
  }
});
//# sourceMappingURL=firecrawl.cjs.map