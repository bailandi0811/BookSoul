import { LLMChain } from "../llm_chain.js";
import { MapReduceDocumentsChain, RefineDocumentsChain, StuffDocumentsChain } from "../combine_docs_chain.js";
import { DEFAULT_PROMPT } from "./stuff_prompts.js";
import { REFINE_PROMPT } from "./refine_prompts.js";

//#region src/chains/summarization/load.ts
const loadSummarizationChain = (llm, params = { type: "map_reduce" }) => {
	const { verbose } = params;
	if (params.type === "stuff") {
		const { prompt = DEFAULT_PROMPT } = params;
		return new StuffDocumentsChain({
			llmChain: new LLMChain({
				prompt,
				llm,
				verbose
			}),
			documentVariableName: "text",
			verbose
		});
	}
	if (params.type === "map_reduce") {
		const { combineMapPrompt = DEFAULT_PROMPT, combinePrompt = DEFAULT_PROMPT, combineLLM, returnIntermediateSteps } = params;
		return new MapReduceDocumentsChain({
			llmChain: new LLMChain({
				prompt: combineMapPrompt,
				llm,
				verbose
			}),
			combineDocumentChain: new StuffDocumentsChain({
				llmChain: new LLMChain({
					prompt: combinePrompt,
					llm: combineLLM ?? llm,
					verbose
				}),
				documentVariableName: "text",
				verbose
			}),
			documentVariableName: "text",
			returnIntermediateSteps,
			verbose
		});
	}
	if (params.type === "refine") {
		const { refinePrompt = REFINE_PROMPT, refineLLM, questionPrompt = DEFAULT_PROMPT } = params;
		return new RefineDocumentsChain({
			llmChain: new LLMChain({
				prompt: questionPrompt,
				llm,
				verbose
			}),
			refineLLMChain: new LLMChain({
				prompt: refinePrompt,
				llm: refineLLM ?? llm,
				verbose
			}),
			documentVariableName: "text",
			verbose
		});
	}
	throw new Error(`Invalid _type: ${params.type}`);
};

//#endregion
export { loadSummarizationChain };
//# sourceMappingURL=load.js.map