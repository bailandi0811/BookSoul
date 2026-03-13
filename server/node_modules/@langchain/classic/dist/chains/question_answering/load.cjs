const require_llm_chain = require('../llm_chain.cjs');
const require_combine_docs_chain = require('../combine_docs_chain.cjs');
const require_stuff_prompts = require('./stuff_prompts.cjs');
const require_map_reduce_prompts = require('./map_reduce_prompts.cjs');
const require_refine_prompts = require('./refine_prompts.cjs');

//#region src/chains/question_answering/load.ts
const loadQAChain = (llm, params = { type: "stuff" }) => {
	const { type } = params;
	if (type === "stuff") return loadQAStuffChain(llm, params);
	if (type === "map_reduce") return loadQAMapReduceChain(llm, params);
	if (type === "refine") return loadQARefineChain(llm, params);
	throw new Error(`Invalid _type: ${type}`);
};
/**
* Loads a StuffQAChain based on the provided parameters. It takes an LLM
* instance and StuffQAChainParams as parameters.
* @param llm An instance of BaseLanguageModel.
* @param params Parameters for creating a StuffQAChain.
* @returns A StuffQAChain instance.
*/
function loadQAStuffChain(llm, params = {}) {
	const { prompt = require_stuff_prompts.QA_PROMPT_SELECTOR.getPrompt(llm), verbose } = params;
	return new require_combine_docs_chain.StuffDocumentsChain({
		llmChain: new require_llm_chain.LLMChain({
			prompt,
			llm,
			verbose
		}),
		verbose
	});
}
/**
* Loads a MapReduceQAChain based on the provided parameters. It takes an
* LLM instance and MapReduceQAChainParams as parameters.
* @param llm An instance of BaseLanguageModel.
* @param params Parameters for creating a MapReduceQAChain.
* @returns A MapReduceQAChain instance.
*/
function loadQAMapReduceChain(llm, params = {}) {
	const { combineMapPrompt = require_map_reduce_prompts.COMBINE_QA_PROMPT_SELECTOR.getPrompt(llm), combinePrompt = require_map_reduce_prompts.COMBINE_PROMPT_SELECTOR.getPrompt(llm), verbose, combineLLM, returnIntermediateSteps } = params;
	return new require_combine_docs_chain.MapReduceDocumentsChain({
		llmChain: new require_llm_chain.LLMChain({
			prompt: combineMapPrompt,
			llm,
			verbose
		}),
		combineDocumentChain: new require_combine_docs_chain.StuffDocumentsChain({
			llmChain: new require_llm_chain.LLMChain({
				prompt: combinePrompt,
				llm: combineLLM ?? llm,
				verbose
			}),
			documentVariableName: "summaries",
			verbose
		}),
		returnIntermediateSteps,
		verbose
	});
}
/**
* Loads a RefineQAChain based on the provided parameters. It takes an LLM
* instance and RefineQAChainParams as parameters.
* @param llm An instance of BaseLanguageModel.
* @param params Parameters for creating a RefineQAChain.
* @returns A RefineQAChain instance.
*/
function loadQARefineChain(llm, params = {}) {
	const { questionPrompt = require_refine_prompts.QUESTION_PROMPT_SELECTOR.getPrompt(llm), refinePrompt = require_refine_prompts.REFINE_PROMPT_SELECTOR.getPrompt(llm), refineLLM, verbose } = params;
	return new require_combine_docs_chain.RefineDocumentsChain({
		llmChain: new require_llm_chain.LLMChain({
			prompt: questionPrompt,
			llm,
			verbose
		}),
		refineLLMChain: new require_llm_chain.LLMChain({
			prompt: refinePrompt,
			llm: refineLLM ?? llm,
			verbose
		}),
		verbose
	});
}

//#endregion
exports.loadQAChain = loadQAChain;
exports.loadQAMapReduceChain = loadQAMapReduceChain;
exports.loadQARefineChain = loadQARefineChain;
exports.loadQAStuffChain = loadQAStuffChain;
//# sourceMappingURL=load.cjs.map