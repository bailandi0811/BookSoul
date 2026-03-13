Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_document_loaders_web_cheerio = require('./cheerio.cjs');
let _langchain_core_documents = require("@langchain/core/documents");

//#region src/document_loaders/web/imsdb.ts
var imsdb_exports = /* @__PURE__ */ require_runtime.__exportAll({ IMSDBLoader: () => IMSDBLoader });
/**
* A class that extends the CheerioWebBaseLoader class. It represents a
* loader for loading web pages from the IMSDB (Internet Movie Script
* Database) website.
*/
var IMSDBLoader = class extends require_document_loaders_web_cheerio.CheerioWebBaseLoader {
	constructor(webPath) {
		super(webPath);
		this.webPath = webPath;
	}
	/**
	* An asynchronous method that loads the web page using the scrape()
	* method inherited from the base class. It selects the element with the
	* class 'scrtext' using the $ function provided by Cheerio and extracts
	* the text content. It creates a Document instance with the text content
	* as the page content and the source as metadata. It returns an array
	* containing the Document instance.
	* @returns An array containing a Document instance.
	*/
	async load() {
		return [new _langchain_core_documents.Document({
			pageContent: (await this.scrape())("td[class='scrtext']").text().trim(),
			metadata: { source: this.webPath }
		})];
	}
};

//#endregion
exports.IMSDBLoader = IMSDBLoader;
Object.defineProperty(exports, 'imsdb_exports', {
  enumerable: true,
  get: function () {
    return imsdb_exports;
  }
});
//# sourceMappingURL=imsdb.cjs.map