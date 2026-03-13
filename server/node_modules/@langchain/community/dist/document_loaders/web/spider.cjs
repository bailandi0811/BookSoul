Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_env = require("@langchain/core/utils/env");
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");
let _spider_cloud_spider_client = require("@spider-cloud/spider-client");

//#region src/document_loaders/web/spider.ts
var spider_exports = /* @__PURE__ */ require_runtime.__exportAll({ SpiderLoader: () => SpiderLoader });
/**
* Class representing a document loader for loading data from
* Spider (spider.cloud). It extends the BaseDocumentLoader class.
* @example
* ```typescript
* const loader = new SpiderLoader({
*   url: "{url}",
*   apiKey: "{apiKey}",
*   mode: "crawl"
* });
* const docs = await loader.load();
* ```
*/
var SpiderLoader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	apiKey;
	url;
	mode;
	params;
	constructor(loaderParams) {
		super();
		const { apiKey = (0, _langchain_core_utils_env.getEnvironmentVariable)("SPIDER_API_KEY"), url, mode = "scrape", params } = loaderParams;
		if (!apiKey) throw new Error("Spider API key not set. You can set it as SPIDER_API_KEY in your .env file, or pass it to Spider.");
		this.apiKey = apiKey;
		this.url = url;
		this.mode = mode;
		this.params = params || {
			metadata: true,
			return_format: "markdown"
		};
	}
	/**
	* Loads the data from the Spider.
	* @returns An array of Documents representing the retrieved data.
	* @throws An error if the data could not be loaded.
	*/
	async load() {
		const app = new _spider_cloud_spider_client.Spider({ apiKey: this.apiKey });
		let spiderDocs;
		if (this.mode === "scrape") {
			const response = await app.scrapeUrl(this.url, this.params);
			if (response.error) throw new Error(`Spider: Failed to scrape URL. Error: ${response.error}`);
			spiderDocs = response;
		} else if (this.mode === "crawl") {
			const response = await app.crawlUrl(this.url, this.params);
			if (response.error) throw new Error(`Spider: Failed to crawl URL. Error: ${response.error}`);
			spiderDocs = response;
		} else throw new Error(`Unrecognized mode '${this.mode}'. Expected one of 'crawl', 'scrape'.`);
		return spiderDocs.map((doc) => new _langchain_core_documents.Document({
			pageContent: doc.content || "",
			metadata: doc.metadata || {}
		}));
	}
};

//#endregion
exports.SpiderLoader = SpiderLoader;
Object.defineProperty(exports, 'spider_exports', {
  enumerable: true,
  get: function () {
    return spider_exports;
  }
});
//# sourceMappingURL=spider.cjs.map