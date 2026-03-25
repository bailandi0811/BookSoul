require("../../_virtual/_rolldown/runtime.cjs");
const DEFAULT_PROMPT = /* @__PURE__ */ new (require("@langchain/core/prompts")).PromptTemplate({
	template: `Write a concise summary of the following:


"{text}"


CONCISE SUMMARY:`,
	inputVariables: ["text"]
});
//#endregion
exports.DEFAULT_PROMPT = DEFAULT_PROMPT;

//# sourceMappingURL=stuff_prompts.cjs.map