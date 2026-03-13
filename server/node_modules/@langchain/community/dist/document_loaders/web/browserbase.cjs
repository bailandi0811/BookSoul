Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");
let _browserbasehq_sdk = require("@browserbasehq/sdk");

//#region src/document_loaders/web/browserbase.ts
var browserbase_exports = /* @__PURE__ */ require_runtime.__exportAll({ BrowserbaseLoader: () => BrowserbaseLoader });
/**
* Load pre-rendered web pages using a headless browser hosted on Browserbase.
*
* Depends on `@browserbasehq/sdk` package.
* Get your API key from https://browserbase.com
*
* @example
* ```typescript
* import { BrowserbaseLoader } from "@langchain/classic/document_loaders/web/browserbase";
*
* const loader = new BrowserbaseLoader(["https://example.com"], {
*   apiKey: process.env.BROWSERBASE_API_KEY,
*   textContent: true,
* });
*
* const docs = await loader.load();
* ```
*
* @param {string[]} urls - The URLs of the web pages to load.
* @param {BrowserbaseLoaderOptions} [options] - Browserbase client options.
*/
var BrowserbaseLoader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	urls;
	options;
	browserbase;
	constructor(urls, options = {}) {
		super();
		this.urls = urls;
		this.options = options;
		this.browserbase = new _browserbasehq_sdk.Browserbase(options);
	}
	/**
	* Load pages from URLs.
	*
	* @returns {Promise<DocumentInterface[]>} - A promise which resolves to a list of documents.
	*/
	async load() {
		const documents = [];
		for await (const doc of this.lazyLoad()) documents.push(doc);
		return documents;
	}
	/**
	* Load pages from URLs.
	*
	* @returns {Generator<DocumentInterface>} - A generator that yields documents.
	*/
	async *lazyLoad() {
		const pages = await this.browserbase.loadURLs(this.urls, this.options);
		let index = 0;
		for await (const page of pages) {
			yield new _langchain_core_documents.Document({
				pageContent: page,
				metadata: { url: this.urls[index] }
			});
			index += index + 1;
		}
	}
};

//#endregion
exports.BrowserbaseLoader = BrowserbaseLoader;
Object.defineProperty(exports, 'browserbase_exports', {
  enumerable: true,
  get: function () {
    return browserbase_exports;
  }
});
//# sourceMappingURL=browserbase.cjs.map