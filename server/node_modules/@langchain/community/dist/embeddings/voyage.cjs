Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_env = require("@langchain/core/utils/env");
let _langchain_core_utils_chunk_array = require("@langchain/core/utils/chunk_array");
let _langchain_core_embeddings = require("@langchain/core/embeddings");

//#region src/embeddings/voyage.ts
var voyage_exports = /* @__PURE__ */ require_runtime.__exportAll({ VoyageEmbeddings: () => VoyageEmbeddings });
/**
* A class for generating embeddings using the Voyage AI API.
*/
var VoyageEmbeddings = class extends _langchain_core_embeddings.Embeddings {
	modelName = "voyage-01";
	batchSize = 8;
	apiKey;
	basePath = "https://api.voyageai.com/v1";
	apiUrl;
	headers;
	inputType;
	truncation;
	outputDimension;
	outputDtype;
	encodingFormat;
	/**
	* Constructor for the VoyageEmbeddings class.
	* @param fields - An optional object with properties to configure the instance.
	*/
	constructor(fields) {
		const fieldsWithDefaults = { ...fields };
		super(fieldsWithDefaults);
		const apiKey = fieldsWithDefaults?.apiKey || (0, _langchain_core_utils_env.getEnvironmentVariable)("VOYAGEAI_API_KEY");
		if (!apiKey) throw new Error("Voyage AI API key not found");
		this.modelName = fieldsWithDefaults?.modelName ?? this.modelName;
		this.batchSize = fieldsWithDefaults?.batchSize ?? this.batchSize;
		this.apiKey = apiKey;
		this.apiUrl = `${this.basePath}/embeddings`;
		this.inputType = fieldsWithDefaults?.inputType;
		this.truncation = fieldsWithDefaults?.truncation;
		this.outputDimension = fieldsWithDefaults?.outputDimension;
		this.outputDtype = fieldsWithDefaults?.outputDtype;
		this.encodingFormat = fieldsWithDefaults?.encodingFormat;
	}
	/**
	* Generates embeddings for an array of texts.
	* @param texts - An array of strings to generate embeddings for.
	* @returns A Promise that resolves to an array of embeddings.
	*/
	async embedDocuments(texts) {
		const batches = (0, _langchain_core_utils_chunk_array.chunkArray)(texts, this.batchSize);
		const batchRequests = batches.map((batch) => this.embeddingWithRetry({
			model: this.modelName,
			input: batch,
			input_type: this.inputType,
			truncation: this.truncation,
			output_dimension: this.outputDimension,
			output_dtype: this.outputDtype,
			encoding_format: this.encodingFormat
		}));
		const batchResponses = await Promise.all(batchRequests);
		const embeddings = [];
		for (let i = 0; i < batchResponses.length; i += 1) {
			const batch = batches[i];
			const { data: batchResponse } = batchResponses[i];
			for (let j = 0; j < batch.length; j += 1) embeddings.push(batchResponse[j].embedding);
		}
		return embeddings;
	}
	/**
	* Generates an embedding for a single text.
	* @param text - A string to generate an embedding for.
	* @returns A Promise that resolves to an array of numbers representing the embedding.
	*/
	async embedQuery(text) {
		const { data } = await this.embeddingWithRetry({
			model: this.modelName,
			input: text,
			input_type: this.inputType,
			truncation: this.truncation,
			output_dimension: this.outputDimension,
			output_dtype: this.outputDtype,
			encoding_format: this.encodingFormat
		});
		return data[0].embedding;
	}
	/**
	* Makes a request to the Voyage AI API to generate embeddings for an array of texts.
	* @param request - An object with properties to configure the request.
	* @returns A Promise that resolves to the response from the Voyage AI API.
	*/
	async embeddingWithRetry(request) {
		const makeCompletionRequest = async () => {
			const url = `${this.apiUrl}`;
			return await (await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
					...this.headers
				},
				body: JSON.stringify(request)
			})).json();
		};
		return this.caller.call(makeCompletionRequest);
	}
};

//#endregion
exports.VoyageEmbeddings = VoyageEmbeddings;
Object.defineProperty(exports, 'voyage_exports', {
  enumerable: true,
  get: function () {
    return voyage_exports;
  }
});
//# sourceMappingURL=voyage.cjs.map