Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let jsdom = require("jsdom");
let _mozilla_readability = require("@mozilla/readability");

//#region src/document_transformers/mozilla_readability.ts
var mozilla_readability_exports = /* @__PURE__ */ require_runtime.__exportAll({ MozillaReadabilityTransformer: () => MozillaReadabilityTransformer });
/**
* A transformer that uses the Mozilla Readability library to extract the
* main content from a web page.
* @example
* ```typescript
* const loader = new HTMLWebBaseLoader("https://example.com/article");
* const docs = await loader.load();
*
* const splitter = new RecursiveCharacterTextSplitter({
*  maxCharacterCount: 5000,
* });
* const transformer = new MozillaReadabilityTransformer();
*
* // The sequence processes the loaded documents through the splitter and then the transformer.
* const sequence = transformer.pipe(splitter);
*
* // Invoke the sequence to transform the documents into a more readable format.
* const newDocuments = await sequence.invoke(docs);
*
* console.log(newDocuments);
* ```
*/
var MozillaReadabilityTransformer = class extends _langchain_core_documents.MappingDocumentTransformer {
	static lc_name() {
		return "MozillaReadabilityTransformer";
	}
	constructor(options = {}) {
		super(options);
		this.options = options;
	}
	async _transformDocument(document) {
		return new _langchain_core_documents.Document({
			pageContent: new _mozilla_readability.Readability(new jsdom.JSDOM(document.pageContent).window.document, this.options).parse()?.textContent ?? "",
			metadata: { ...document.metadata }
		});
	}
};

//#endregion
exports.MozillaReadabilityTransformer = MozillaReadabilityTransformer;
Object.defineProperty(exports, 'mozilla_readability_exports', {
  enumerable: true,
  get: function () {
    return mozilla_readability_exports;
  }
});
//# sourceMappingURL=mozilla_readability.cjs.map