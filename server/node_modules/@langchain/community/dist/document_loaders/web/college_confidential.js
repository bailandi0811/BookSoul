import { __exportAll } from "../../_virtual/_rolldown/runtime.js";
import { CheerioWebBaseLoader } from "./cheerio.js";
import { Document } from "@langchain/core/documents";

//#region src/document_loaders/web/college_confidential.ts
var college_confidential_exports = /* @__PURE__ */ __exportAll({ CollegeConfidentialLoader: () => CollegeConfidentialLoader });
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
var CollegeConfidentialLoader = class extends CheerioWebBaseLoader {
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
		return [new Document({
			pageContent: (await this.scrape())("main[class='skin-handler']").text(),
			metadata: { source: this.webPath }
		})];
	}
};

//#endregion
export { CollegeConfidentialLoader, college_confidential_exports };
//# sourceMappingURL=college_confidential.js.map