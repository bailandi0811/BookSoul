Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');

//#region src/schema/prompt_template.ts
var prompt_template_exports = /* @__PURE__ */ require_runtime.__exportAll({ formatDocument: () => formatDocument });
/**
* Formats a document using a given prompt template.
*
* @async
* @param {Document} document - The document to format.
* @param {BasePromptTemplate} prompt - The prompt template to use for formatting.
* @returns {Promise<string>} A Promise that resolves to the formatted document as a string.
* @throws {Error} If the document is missing required metadata variables specified in the prompt template.
*/
const formatDocument = async (document, prompt) => {
	const baseInfo = {
		pageContent: document.pageContent,
		...document.metadata
	};
	const variables = new Set(prompt.inputVariables);
	const requiredMetadata = new Set(prompt.inputVariables.map((v) => v !== "pageContent" ? v : null).filter((v) => v !== null));
	const missingMetadata = [];
	for (const variable of variables) if (!(variable in baseInfo) && variable !== "pageContent") missingMetadata.push(variable);
	if (missingMetadata.length) throw new Error(`Document prompt requires documents to have metadata variables: ${JSON.stringify(requiredMetadata)}. Received document with missing metadata: ${JSON.stringify(missingMetadata)}`);
	return prompt.format(baseInfo);
};

//#endregion
exports.formatDocument = formatDocument;
Object.defineProperty(exports, 'prompt_template_exports', {
  enumerable: true,
  get: function () {
    return prompt_template_exports;
  }
});
//# sourceMappingURL=prompt_template.cjs.map