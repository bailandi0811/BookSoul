Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_vectorstores = require("@langchain/core/vectorstores");

//#region src/retrievers/score_threshold.ts
var score_threshold_exports = /* @__PURE__ */ require_runtime.__exportAll({ ScoreThresholdRetriever: () => ScoreThresholdRetriever });
var ScoreThresholdRetriever = class extends _langchain_core_vectorstores.VectorStoreRetriever {
	minSimilarityScore;
	kIncrement = 10;
	maxK = 100;
	constructor(input) {
		super(input);
		this.maxK = input.maxK ?? this.maxK;
		this.minSimilarityScore = input.minSimilarityScore ?? this.minSimilarityScore;
		this.kIncrement = input.kIncrement ?? this.kIncrement;
	}
	async invoke(query) {
		let currentK = 0;
		let filteredResults = [];
		do {
			currentK += this.kIncrement;
			filteredResults = (await this.vectorStore.similaritySearchWithScore(query, currentK, this.filter)).filter(([, score]) => score >= this.minSimilarityScore);
		} while (filteredResults.length >= currentK && currentK < this.maxK);
		return filteredResults.map((documents) => documents[0]).slice(0, this.maxK);
	}
	static fromVectorStore(vectorStore, options) {
		return new this({
			...options,
			vectorStore
		});
	}
};

//#endregion
exports.ScoreThresholdRetriever = ScoreThresholdRetriever;
Object.defineProperty(exports, 'score_threshold_exports', {
  enumerable: true,
  get: function () {
    return score_threshold_exports;
  }
});
//# sourceMappingURL=score_threshold.cjs.map