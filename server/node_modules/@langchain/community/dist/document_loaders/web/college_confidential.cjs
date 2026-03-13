Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_document_loaders_web_cheerio = require('./cheerio.cjs');
let _langchain_core_documents = require("@langchain/core/documents");

//#region src/document_loaders/web/college_confidential.ts
var college_confidential_exports = /* @__PURE__ */ require_runtime.__exportAll({ CollegeConfidentialLoader: () => CollegeConfidentialLoader });
/**
* A document loader specifically designed for loading documents from the
* College Confidential website. It extends the CheerioWebBaseLoader.
* @example
* ```typescript
* const loader = new CollegeConfidentialLoader("https:exampleurl.com");
* const docs = await loader.load();
* console.log({ docs });
* ```
*/
var CollegeConfidentialLoader = class extends require_document_loaders_web_cheerio.CheerioWebBaseLoader {
	constructor(webPath) {
		super(webPath);
	}
	/**
	* Overrides the base load() method to extract the text content from the
	* loaded document using a specific selector for the College Confidential
	* website. It creates a Document instance with the extracted text and
	* metadata, and returns an array containing the Document instance.
	* @returns An array containing a Document instance with the extracted text and metadata from the loaded College Confidential web document.
	*/
	async load() {
		return [new _langchain_core_documents.Document({
			pageContent: (await this.scrape())("main[class='skin-handler']").text(),
			metadata: { source: this.webPath }
		})];
	}
};

//#endregion
exports.CollegeConfidentialLoader = CollegeConfidentialLoader;
Object.defineProperty(exports, 'college_confidential_exports', {
  enumerable: true,
  get: function () {
    return college_confidential_exports;
  }
});
//# sourceMappingURL=college_confidential.cjs.map