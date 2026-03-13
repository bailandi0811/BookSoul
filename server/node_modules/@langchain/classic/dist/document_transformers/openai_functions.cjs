Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_tagging = require('../chains/openai_functions/tagging.cjs');
require('../chains/openai_functions/index.cjs');
let _langchain_core_utils_json_schema = require("@langchain/core/utils/json_schema");
let _langchain_openai = require("@langchain/openai");
let _langchain_core_documents = require("@langchain/core/documents");

//#region src/document_transformers/openai_functions.ts
var openai_functions_exports = /* @__PURE__ */ require_runtime.__exportAll({
	MetadataTagger: () => MetadataTagger,
	createMetadataTagger: () => createMetadataTagger,
	createMetadataTaggerFromZod: () => createMetadataTaggerFromZod
});
/**
* A transformer that tags metadata to a document using a tagging chain.
*/
var MetadataTagger = class extends _langchain_core_documents.MappingDocumentTransformer {
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
		return new _langchain_core_documents.Document({
			pageContent: document.pageContent,
			metadata: {
				...extractedMetadata,
				...document.metadata
			}
		});
	}
};
function createMetadataTagger(schema, options) {
	const { llm = new _langchain_openai.ChatOpenAI({ model: "gpt-3.5-turbo-0613" }), ...rest } = options;
	return new MetadataTagger({ taggingChain: require_tagging.createTaggingChain(schema, llm, rest) });
}
function createMetadataTaggerFromZod(schema, options) {
	return createMetadataTagger((0, _langchain_core_utils_json_schema.toJsonSchema)(schema), options);
}

//#endregion
exports.MetadataTagger = MetadataTagger;
exports.createMetadataTagger = createMetadataTagger;
exports.createMetadataTaggerFromZod = createMetadataTaggerFromZod;
Object.defineProperty(exports, 'openai_functions_exports', {
  enumerable: true,
  get: function () {
    return openai_functions_exports;
  }
});
//# sourceMappingURL=openai_functions.cjs.map