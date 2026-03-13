import { __exportAll } from "../_virtual/_rolldown/runtime.js";
import { chunkArray } from "@langchain/core/utils/chunk_array";
import { Embeddings } from "@langchain/core/embeddings";

//#region src/embeddings/huggingface_transformers.ts
var huggingface_transformers_exports = /* @__PURE__ */ __exportAll({ HuggingFaceTransformersEmbeddings: () => HuggingFaceTransformersEmbeddings });
/**
* @example
* ```typescript
* const model = new HuggingFaceTransformersEmbeddings({
*   model: "Xenova/all-MiniLM-L6-v2",
* });
*
* // Embed a single query
* const res = await model.embedQuery(
*   "What would be a good company name for a company that makes colorful socks?"
* );
* console.log({ res });
*
* // Embed multiple documents
* const documentRes = await model.embedDocuments(["Hello world", "Bye bye"]);
* console.log({ documentRes });
* ```
*/
var HuggingFaceTransformersEmbeddings = class extends Embeddings {
	model = "Xenova/all-MiniLM-L6-v2";
	batchSize = 512;
	stripNewLines = true;
	timeout;
	pretrainedOptions;
	pipelineOptions;
	pipelinePromise = null;
	constructor(fields) {
		super(fields ?? {});
		this.model = fields?.model ?? this.model;
		this.stripNewLines = fields?.stripNewLines ?? this.stripNewLines;
		this.timeout = fields?.timeout;
		this.pretrainedOptions = fields?.pretrainedOptions ?? {};
		this.pipelineOptions = {
			pooling: "mean",
			normalize: true,
			...fields?.pipelineOptions
		};
	}
	async embedDocuments(texts) {
		const batchRequests = chunkArray(this.stripNewLines ? texts.map((t) => t.replace(/\n/g, " ")) : texts, this.batchSize).map((batch) => this.runEmbedding(batch));
		const batchResponses = await Promise.all(batchRequests);
		const embeddings = [];
		for (let i = 0; i < batchResponses.length; i += 1) {
			const batchResponse = batchResponses[i];
			for (let j = 0; j < batchResponse.length; j += 1) embeddings.push(batchResponse[j]);
		}
		return embeddings;
	}
	async embedQuery(text) {
		return (await this.runEmbedding([this.stripNewLines ? text.replace(/\n/g, " ") : text]))[0];
	}
	async runEmbedding(texts) {
		if (!this.pipelinePromise) this.pipelinePromise = (async () => {
			const pipeline = (await import("@huggingface/transformers")).pipeline;
			return await pipeline("feature-extraction", this.model, this.pretrainedOptions);
		})();
		const pipe = await this.pipelinePromise;
		return this.caller.call(async () => {
			return (await pipe(texts, this.pipelineOptions)).tolist();
		});
	}
};

//#endregion
export { HuggingFaceTransformersEmbeddings, huggingface_transformers_exports };
//# sourceMappingURL=huggingface_transformers.js.map