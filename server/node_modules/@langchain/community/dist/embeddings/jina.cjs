Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_env = require("@langchain/core/utils/env");
let _langchain_core_utils_chunk_array = require("@langchain/core/utils/chunk_array");
let _langchain_core_embeddings = require("@langchain/core/embeddings");

//#region src/embeddings/jina.ts
var jina_exports = /* @__PURE__ */ require_runtime.__exportAll({ JinaEmbeddings: () => JinaEmbeddings });
var JinaEmbeddings = class extends _langchain_core_embeddings.Embeddings {
	model = "jina-clip-v2";
	batchSize = 24;
	baseUrl = "https://api.jina.ai/v1/embeddings";
	stripNewLines = true;
	dimensions = 1024;
	apiKey;
	normalized = true;
	constructor(fields) {
		const fieldsWithDefaults = {
			maxConcurrency: 2,
			...fields
		};
		super(fieldsWithDefaults);
		const apiKey = fieldsWithDefaults?.apiKey || (0, _langchain_core_utils_env.getEnvironmentVariable)("JINA_API_KEY") || (0, _langchain_core_utils_env.getEnvironmentVariable)("JINA_AUTH_TOKEN");
		if (!apiKey) throw new Error("Jina API key not found");
		this.apiKey = apiKey;
		this.model = fieldsWithDefaults?.model ?? this.model;
		this.dimensions = fieldsWithDefaults?.dimensions ?? this.dimensions;
		this.batchSize = fieldsWithDefaults?.batchSize ?? this.batchSize;
		this.stripNewLines = fieldsWithDefaults?.stripNewLines ?? this.stripNewLines;
		this.normalized = fieldsWithDefaults?.normalized ?? this.normalized;
	}
	doStripNewLines(input) {
		if (this.stripNewLines) return input.map((i) => {
			if (typeof i === "string") return i.replace(/\n/g, " ");
			if (i.text) return { text: i.text.replace(/\n/g, " ") };
			return i;
		});
		return input;
	}
	async embedDocuments(input) {
		const batches = (0, _langchain_core_utils_chunk_array.chunkArray)(this.doStripNewLines(input), this.batchSize);
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
	async embedQuery(input) {
		const params = this.getParams(this.doStripNewLines([input]), true);
		return (await this.embeddingWithRetry(params) || [[]])[0];
	}
	getParams(input, query) {
		return {
			model: this.model,
			input,
			dimensions: this.dimensions,
			task: query ? "retrieval.query" : "retrieval.passage",
			normalized: this.normalized
		};
	}
	async embeddingWithRetry(body) {
		const embeddingData = await (await fetch(this.baseUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`
			},
			body: JSON.stringify(body)
		})).json();
		if ("detail" in embeddingData && embeddingData.detail) throw new Error(`${embeddingData.detail}`);
		return embeddingData.data.map(({ embedding }) => embedding);
	}
};

//#endregion
exports.JinaEmbeddings = JinaEmbeddings;
Object.defineProperty(exports, 'jina_exports', {
  enumerable: true,
  get: function () {
    return jina_exports;
  }
});
//# sourceMappingURL=jina.cjs.map