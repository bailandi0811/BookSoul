const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_prompts = require("@langchain/core/prompts");
let _langchain_core_example_selectors = require("@langchain/core/example_selectors");

//#region src/chains/question_answering/stuff_prompts.ts
const DEFAULT_QA_PROMPT = /* @__PURE__ */ new _langchain_core_prompts.PromptTemplate({
	template: "Use the following pieces of context to answer the question at the end. If you don't know the answer, just say that you don't know, don't try to make up an answer.\n\n{context}\n\nQuestion: {question}\nHelpful Answer:",
	inputVariables: ["context", "question"]
});
const messages = [/* @__PURE__ */ _langchain_core_prompts.SystemMessagePromptTemplate.fromTemplate(`Use the following pieces of context to answer the users question. 
If you don't know the answer, just say that you don't know, don't try to make up an answer.
----------------
{context}`), /* @__PURE__ */ _langchain_core_prompts.HumanMessagePromptTemplate.fromTemplate("{question}")];
const CHAT_PROMPT = /* @__PURE__ */ _langchain_core_prompts.ChatPromptTemplate.fromMessages(messages);
const QA_PROMPT_SELECTOR = /* @__PURE__ */ new _langchain_core_example_selectors.ConditionalPromptSelector(DEFAULT_QA_PROMPT, [[_langchain_core_example_selectors.isChatModel, CHAT_PROMPT]]);

//#endregion
exports.QA_PROMPT_SELECTOR = QA_PROMPT_SELECTOR;
//# sourceMappingURL=stuff_prompts.cjs.map