require("../../_virtual/_rolldown/runtime.cjs");
const REFINE_PROMPT = /* @__PURE__ */ new (require("@langchain/core/prompts")).PromptTemplate({
	template: `Your job is to produce a final summary
We have provided an existing summary up to a certain point: "{existing_answer}"
We have the opportunity to refine the existing summary
(only if needed) with some more context below.
------------
"{text}"
------------

Given the new context, refine the original summary
If the context isn't useful, return the original summary.

REFINED SUMMARY:`,
	inputVariables: ["existing_answer", "text"]
});
//#endregion
exports.REFINE_PROMPT = REFINE_PROMPT;

//# sourceMappingURL=refine_prompts.cjs.map