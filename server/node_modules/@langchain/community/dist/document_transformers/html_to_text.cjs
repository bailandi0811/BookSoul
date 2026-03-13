Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let html_to_text = require("html-to-text");

//#region src/document_transformers/html_to_text.ts
var html_to_text_exports = /* @__PURE__ */ require_runtime.__exportAll({ HtmlToTextTransformer: () => HtmlToTextTransformer });
/**
* A transformer that converts HTML content to plain text.
* @example
* ```typescript
* const loader = new CheerioWebBaseLoader("https://example.com/some-page");
* const docs = await loader.load();
*
* const splitter = new RecursiveCharacterTextSplitter({
*  maxCharacterCount: 1000,
* });
* const transformer = new HtmlToTextTransformer();
*
* // The sequence of text splitting followed by HTML to text transformation
* const sequence = splitter.pipe(transformer);
*
* // Processing the loaded documents through the sequence
* const newDocuments = await sequence.invoke(docs);
*
* console.log(newDocuments);
* ```
*/
var HtmlToTextTransformer = class extends _langchain_core_documents.MappingDocumentTransformer {
	static lc_name() {
		return "HtmlToTextTransformer";
	}
	constructor(options = {}) {
		super(options);
		this.options = options;
	}
	async _transformDocument(document) {
		return new _langchain_core_documents.Document({
			pageContent: (0, html_to_text.htmlToText)(document.pageContent, this.options),
			metadata: { ...document.metadata }
		});
	}
};

//#endregion
exports.HtmlToTextTransformer = HtmlToTextTransformer;
Object.defineProperty(exports, 'html_to_text_exports', {
  enumerable: true,
  get: function () {
    return html_to_text_exports;
  }
});
//# sourceMappingURL=html_to_text.cjs.map