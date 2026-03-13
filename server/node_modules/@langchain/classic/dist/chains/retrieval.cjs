Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_runnables = require("@langchain/core/runnables");

//#region src/chains/retrieval.ts
var retrieval_exports = /* @__PURE__ */ require_runtime.__exportAll({ createRetrievalChain: () => createRetrievalChain });
function isBaseRetriever(x) {
	return !!x && typeof x.invoke === "function";
}
/**
* Create a retrieval chain that retrieves documents and then passes them on.
* @param {CreateRetrievalChainParams} params A params object
*     containing a retriever and a combineDocsChain.
* @returns An LCEL Runnable which returns a an object
*     containing at least `context` and `answer` keys.
* @example
* ```typescript
* // pnpm add langchain @langchain/openai
*
* import { ChatOpenAI } from "@langchain/openai";
* import { pull } from "langchain/hub";
* import { createRetrievalChain } from "@langchain/classic/chains/retrieval";
* import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";
*
* const retrievalQAChatPrompt = await pull("langchain-ai/retrieval-qa-chat");
* const llm = new ChatOpenAI({ model: "gpt-4o-mini" });
* const retriever = ...
* const combineDocsChain = await createStuffDocumentsChain(...);
* const retrievalChain = await createRetrievalChain({
*   retriever,
*   combineDocsChain,
* });
* const response = await chain.invoke({ input: "..." });
* ```
*/
async function createRetrievalChain({ retriever, combineDocsChain }) {
	let retrieveDocumentsChain;
	if (isBaseRetriever(retriever)) retrieveDocumentsChain = _langchain_core_runnables.RunnableSequence.from([(input) => input.input, retriever]);
	else retrieveDocumentsChain = retriever;
	return _langchain_core_runnables.RunnableSequence.from([_langchain_core_runnables.RunnablePassthrough.assign({
		context: retrieveDocumentsChain.withConfig({ runName: "retrieve_documents" }),
		chat_history: (input) => input.chat_history ?? []
	}), _langchain_core_runnables.RunnablePassthrough.assign({ answer: combineDocsChain })]).withConfig({ runName: "retrieval_chain" });
}

//#endregion
exports.createRetrievalChain = createRetrievalChain;
Object.defineProperty(exports, 'retrieval_exports', {
  enumerable: true,
  get: function () {
    return retrieval_exports;
  }
});
//# sourceMappingURL=retrieval.cjs.map