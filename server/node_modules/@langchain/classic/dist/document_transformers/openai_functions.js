import { __exportAll } from "../_virtual/_rolldown/runtime.js";
import { createTaggingChain } from "../chains/openai_functions/tagging.js";
import "../chains/openai_functions/index.js";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { ChatOpenAI } from "@langchain/openai";
import { Document, MappingDocumentTransformer } from "@langchain/core/documents";

//#region src/document_transformers/openai_functions.ts
var openai_functions_exports = /* @__PURE__ */ __exportAll({
	MetadataTagger: () => MetadataTagger,
	createMetadataTagger: () => createMetadataTagger,
	createMetadataTaggerFromZod: () => createMetadataTaggerFromZod
});
/**
* A transformer that tags metadata to a document using a tagging chain.
*/
var MetadataTagger = class extends MappingDocumentTransformer {
	static lc_name() {
		return "MetadataTagger";
	}
	taggingChain;
	constructor(fields) {
		super();
		this.taggingChain = fields.taggingChain;
		if (this.taggingChain.inputKeys.length !== 1) throw new Error("Invalid input chain. The input chain must have exactly one input.");
		if (this.taggingChain.outputKeys.length !== 1) throw new Error("Invalid input chain. The input chain must have exactly one output.");
	}
	async _transformDocument(document) {
		const extractedMetadata = (await this.taggingChain.call({ [this.taggingChain.inputKeys[0]]: document.pageContent }))[this.taggingChain.outputKeys[0]];
		return new Document({
			pageContent: document.pageContent,
			metadata: {
				...extractedMetadata,
				...document.metadata
			}
		});
	}
};
function createMetadataTagger(schema, options) {
	const { llm = new ChatOpenAI({ model: "gpt-3.5-turbo-0613" }), ...rest } = options;
	return new MetadataTagger({ taggingChain: createTaggingChain(schema, llm, rest) });
}
function createMetadataTaggerFromZod(schema, options) {
	return createMetadataTagger(toJsonSchema(schema), options);
}

//#endregion
export { MetadataTagger, createMetadataTagger, createMetadataTaggerFromZod, openai_functions_exports };
//# sourceMappingURL=openai_functions.js.map