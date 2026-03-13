Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_env = require("@langchain/core/utils/env");
let _langchain_core_utils_chunk_array = require("@langchain/core/utils/chunk_array");
let _langchain_core_embeddings = require("@langchain/core/embeddings");

//#region src/embeddings/alibaba_tongyi.ts
var alibaba_tongyi_exports = /* @__PURE__ */ require_runtime.__exportAll({ AlibabaTongyiEmbeddings: () => AlibabaTongyiEmbeddings });
var AlibabaTongyiEmbeddings = class extends _langchain_core_embeddings.Embeddings {
	modelName = "text-embedding-v2";
	batchSize = 24;
	stripNewLines = true;
	apiKey;
	parameters;
	constructor(fields) {
		const fieldsWithDefaults = {
			maxConcurrency: 2,
			...fields
		};
		super(fieldsWithDefaults);
		const apiKey = fieldsWithDefaults?.apiKey ?? (0, _langchain_core_utils_env.getEnvironmentVariable)("ALIBABA_API_KEY");
		if (!apiKey) throw new Error("AlibabaAI API key not found");
		this.apiKey = apiKey;
		this.modelName = fieldsWithDefaults?.modelName ?? this.modelName;
		this.batchSize = fieldsWithDefaults?.batchSize ?? this.batchSize;
		this.stripNewLines = fieldsWithDefaults?.stripNewLines ?? this.stripNewLines;
		this.parameters = { text_type: fieldsWithDefaults?.parameters?.text_type ?? "document" };
	}
	/**
	* Method to generate embeddings for an array of documents. Splits the
	* documents into batches and makes requests to the AlibabaTongyi API to generate
	* embeddings.
	* @param texts Array of documents to generate embeddings for.
	* @returns Promise that resolves to a 2D array of embeddings for each document.
	*/
	async embedDocuments(texts) {
		const batches = (0, _langchain_core_utils_chunk_array.chunkArray)(this.stripNewLines ? texts.map((t) => t.replace(/\n/g, " ")) : texts, this.batchSize);
		const batchRequests = batches.map((batch) => {
			const params = this.getParams(batch);
			return this.embeddingWithRetry(params);
		});
		const batchResponses = await Promise.all(batchRequests);
		const embeddings = [];
		for (let i = 0; i < batchResponses.length; i += 1) {
			const batch = batches[i];
			const batchResponse = batchResponses[i] || [];
			for (let j = 0; j < batch.length; j += 1) embeddings.push(batchResponse[j]);
		}
		return embeddings;
	}
	/**
	* Method to generate an embedding for a single document. Calls the
	* embeddingWithRetry method with the document as the input.
	* @param text Document to generate an embedding for.
	* @returns Promise that resolves to an embedding for the document.
	*/
	async embedQuery(text) {
		const params = this.getParams([this.stripNewLines ? text.replace(/\n/g, " ") : text]);
		return (await this.embeddingWithRetry(params) || [[]])[0];
	}
	/**
	* Method to generate an embedding params.
	* @param texts Array of documents to generate embeddings for.
	* @returns an embedding params.
	*/
	getParams(texts) {
		return {
			model: this.modelName,
			input: { texts },
			parameters: this.parameters
		};
	}
	/**
	* Private method to make a request to the OpenAI API to generate
	* embeddings. Handles the retry logic and returns the response from the
	* API.
	* @param request Request to send to the OpenAI API.
	* @returns Promise that resolves to the response from the API.
	*/
	async embeddingWithRetry(body) {
		return fetch("https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`
			},
			body: JSON.stringify(body)
		}).then(async (response) => {
			const embeddingData = await response.json();
			if ("code" in embeddingData && embeddingData.code) throw new Error(`${embeddingData.code}: ${embeddingData.message}`);
			return embeddingData.output.embeddings.map(({ embedding }) => embedding);
		});
	}
};

//#endregion
exports.AlibabaTongyiEmbeddings = AlibabaTongyiEmbeddings;
Object.defineProperty(exports, 'alibaba_tongyi_exports', {
  enumerable: true,
  get: function () {
    return alibaba_tongyi_exports;
  }
});
//# sourceMappingURL=alibaba_tongyi.cjs.map