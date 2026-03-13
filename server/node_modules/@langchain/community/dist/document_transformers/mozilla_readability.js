import { __exportAll } from "../_virtual/_rolldown/runtime.js";
import { Document, MappingDocumentTransformer } from "@langchain/core/documents";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

//#region src/document_transformers/mozilla_readability.ts
var mozilla_readability_exports = /* @__PURE__ */ __exportAll({ MozillaReadabilityTransformer: () => MozillaReadabilityTransformer });
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
var MozillaReadabilityTransformer = class extends MappingDocumentTransformer {
	static lc_name() {
		return "MozillaReadabilityTransformer";
	}
	constructor(options = {}) {
		super(options);
		this.options = options;
	}
	async _transformDocument(document) {
		return new Document({
			pageContent: new Readability(new JSDOM(document.pageContent).window.document, this.options).parse()?.textContent ?? "",
			metadata: { ...document.metadata }
		});
	}
};

//#endregion
export { MozillaReadabilityTransformer, mozilla_readability_exports };
//# sourceMappingURL=mozilla_readability.js.map