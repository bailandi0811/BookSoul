require("../../_virtual/_rolldown/runtime.cjs");
let _langchain_core_prompts = require("@langchain/core/prompts");
//#region src/chains/combine_documents/base.ts
const DOCUMENTS_KEY = "context";
const DEFAULT_DOCUMENT_PROMPT = /* @__PURE__ */ _langchain_core_prompts.PromptTemplate.fromTemplate("{page_content}");
async function formatDocuments({ documentPrompt, documentSeparator, documents, config }) {
	if (documents == null || documents.length === 0) return "";
	return (await Promise.all(documents.map((document) => documentPrompt.withConfig({ runName: "document_formatter" }).invoke({
		...document.metadata,
		page_content: document.pageContent
	}, config)))).join(documentSeparator);
}
//#endregion
exports.DEFAULT_DOCUMENT_PROMPT = DEFAULT_DOCUMENT_PROMPT;
exports.DOCUMENTS_KEY = DOCUMENTS_KEY;
exports.formatDocuments = formatDocuments;

//# sourceMappingURL=base.cjs.map