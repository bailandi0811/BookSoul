import { PromptTemplate } from "@langchain/core/prompts";
const DEFAULT_PROMPT = /* @__PURE__ */ new PromptTemplate({
	template: `Write a concise summary of the following:


"{text}"


CONCISE SUMMARY:`,
	inputVariables: ["text"]
});
//#endregion
export { DEFAULT_PROMPT };

//# sourceMappingURL=stuff_prompts.js.map