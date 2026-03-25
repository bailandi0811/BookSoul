require("../_virtual/_rolldown/runtime.cjs");
const NAIVE_FIX_PROMPT = /* @__PURE__ */ require("@langchain/core/prompts").PromptTemplate.fromTemplate(`Instructions:
--------------
{instructions}
--------------
Completion:
--------------
{completion}
--------------

Above, the Completion did not satisfy the constraints given in the Instructions.
Error:
--------------
{error}
--------------

Please try again. Please only respond with an answer that satisfies the constraints laid out in the Instructions:`);
//#endregion
exports.NAIVE_FIX_PROMPT = NAIVE_FIX_PROMPT;

//# sourceMappingURL=prompts.cjs.map