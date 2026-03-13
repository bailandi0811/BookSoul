Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_llm_chain = require('../../chains/llm_chain.cjs');
const require_retrievers_document_compressors_index = require('./index.cjs');
const require_chain_extract_prompt = require('./chain_extract_prompt.cjs');
let _langchain_core_prompts = require("@langchain/core/prompts");
let _langchain_core_output_parsers = require("@langchain/core/output_parsers");
let _langchain_core_documents = require("@langchain/core/documents");

//#region src/retrievers/document_compressors/chain_extract.ts
var chain_extract_exports = /* @__PURE__ */ require_runtime.__exportAll({ LLMChainExtractor: () => LLMChainExtractor });
function defaultGetInput(query, doc) {
	return {
		question: query,
		context: doc.pageContent
	};
}
var NoOutputParser = class extends _langchain_core_output_parsers.BaseOutputParser {
	lc_namespace = [
		"langchain",
		"retrievers",
		"document_compressors",
		"chain_extract"
	];
	noOutputStr = "NO_OUTPUT";
	parse(text) {
		const cleanedText = text.trim();
		if (cleanedText === this.noOutputStr) return Promise.resolve("");
		return Promise.resolve(cleanedText);
	}
	getFormatInstructions() {
		throw new Error("Method not implemented.");
	}
};
function getDefaultChainPrompt() {
	const outputParser = new NoOutputParser();
	return new _langchain_core_prompts.PromptTemplate({
		template: require_chain_extract_prompt.PROMPT_TEMPLATE(outputParser.noOutputStr),
		inputVariables: ["question", "context"],
		outputParser
	});
}
/**
* A class that uses an LLM chain to extract relevant parts of documents.
* It extends the BaseDocumentCompressor class.
*/
var LLMChainExtractor = class LLMChainExtractor extends require_retrievers_document_compressors_index.BaseDocumentCompressor {
	llmChain;
	getInput = defaultGetInput;
	constructor({ llmChain, getInput }) {
		super();
		this.llmChain = llmChain;
		this.getInput = getInput;
	}
	/**
	* Compresses a list of documents based on the output of an LLM chain.
	* @param documents The list of documents to be compressed.
	* @param query The query to be used for document compression.
	* @returns A list of compressed documents.
	*/
	async compressDocuments(documents, query) {
		return (await Promise.all(documents.map(async (doc) => {
			const input = this.getInput(query, doc);
			const output = await this.llmChain.predict(input);
			return output.length > 0 ? new _langchain_core_documents.Document({
				pageContent: output,
				metadata: doc.metadata
			}) : void 0;
		}))).filter((doc) => doc !== void 0);
	}
	/**
	* Creates a new instance of LLMChainExtractor from a given LLM, prompt
	* template, and getInput function.
	* @param llm The BaseLanguageModel instance used for document extraction.
	* @param prompt The PromptTemplate instance used for document extraction.
	* @param getInput A function used for constructing the chain input from the query and a Document.
	* @returns A new instance of LLMChainExtractor.
	*/
	static fromLLM(llm, prompt, getInput) {
		const _prompt = prompt || getDefaultChainPrompt();
		const _getInput = getInput || defaultGetInput;
		return new LLMChainExtractor({
			llmChain: new require_llm_chain.LLMChain({
				llm,
				prompt: _prompt
			}),
			getInput: _getInput
		});
	}
};

//#endregion
exports.LLMChainExtractor = LLMChainExtractor;
Object.defineProperty(exports, 'chain_extract_exports', {
  enumerable: true,
  get: function () {
    return chain_extract_exports;
  }
});
//# sourceMappingURL=chain_extract.cjs.map