import { __exportAll } from "../_virtual/_rolldown/runtime.js";
import { Document, MappingDocumentTransformer } from "@langchain/core/documents";
import { htmlToText } from "html-to-text";

//#region src/document_transformers/html_to_text.ts
var html_to_text_exports = /* @__PURE__ */ __exportAll({ HtmlToTextTransformer: () => HtmlToTextTransformer });
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
var HtmlToTextTransformer = class extends MappingDocumentTransformer {
	static lc_name() {
		return "HtmlToTextTransformer";
	}
	constructor(options = {}) {
		super(options);
		this.options = options;
	}
	async _transformDocument(document) {
		return new Document({
			pageContent: htmlToText(document.pageContent, this.options),
			metadata: { ...document.metadata }
		});
	}
};

//#endregion
export { HtmlToTextTransformer, html_to_text_exports };
//# sourceMappingURL=html_to_text.js.map