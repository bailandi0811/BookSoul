Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_structured_query = require("@langchain/core/structured_query");

//#region src/structured_query/chroma.ts
var chroma_exports = /* @__PURE__ */ require_runtime.__exportAll({ ChromaTranslator: () => ChromaTranslator });
/**
* Specialized translator for the Chroma vector database. It extends the
* BasicTranslator class and translates internal query language elements
* to valid filters. The class defines a subset of allowed logical
* operators and comparators that can be used in the translation process.
* @example
* ```typescript
* const chromaTranslator = new ChromaTranslator();
* const selfQueryRetriever = new SelfQueryRetriever({
*   llm: new ChatOpenAI({ model: "gpt-4o-mini" }),
*   vectorStore: new Chroma(),
*   documentContents: "Brief summary of a movie",
*   attributeInfo: [],
*   structuredQueryTranslator: chromaTranslator,
* });
*
* const relevantDocuments = await selfQueryRetriever.getRelevantDocuments(
*   "Which movies are directed by Greta Gerwig?",
* );
* ```
*/
var ChromaTranslator = class extends _langchain_core_structured_query.BaseTranslator {
	allowedOperators = [_langchain_core_structured_query.Operators.and, _langchain_core_structured_query.Operators.or];
	allowedComparators = [
		_langchain_core_structured_query.Comparators.eq,
		_langchain_core_structured_query.Comparators.ne,
		_langchain_core_structured_query.Comparators.gt,
		_langchain_core_structured_query.Comparators.gte,
		_langchain_core_structured_query.Comparators.lt,
		_langchain_core_structured_query.Comparators.lte
	];
	formatFunction(func) {
		if (func in _langchain_core_structured_query.Comparators) {
			if (this.allowedComparators.length > 0 && this.allowedComparators.indexOf(func) === -1) throw new Error(`Comparator ${func} not allowed. Allowed comparators: ${this.allowedComparators.join(", ")}`);
		} else if (func in _langchain_core_structured_query.Operators) {
			if (this.allowedOperators.length > 0 && this.allowedOperators.indexOf(func) === -1) throw new Error(`Operator ${func} not allowed. Allowed operators: ${this.allowedOperators.join(", ")}`);
		} else throw new Error("Unknown comparator or operator");
		return `$${func}`;
	}
	visitOperation(operation) {
		const args = operation.args?.map((arg) => arg.accept(this));
		return { [this.formatFunction(operation.operator)]: args };
	}
	visitComparison(comparison) {
		return { [comparison.attribute]: { [this.formatFunction(comparison.comparator)]: (0, _langchain_core_structured_query.castValue)(comparison.value) } };
	}
	visitStructuredQuery(query) {
		let nextArg = {};
		if (query.filter) nextArg = { filter: query.filter.accept(this) };
		return nextArg;
	}
	mergeFilters(defaultFilter, generatedFilter, mergeType = "and", forceDefaultFilter = false) {
		if ((0, _langchain_core_structured_query.isFilterEmpty)(defaultFilter) && (0, _langchain_core_structured_query.isFilterEmpty)(generatedFilter)) return;
		if ((0, _langchain_core_structured_query.isFilterEmpty)(defaultFilter) || mergeType === "replace") {
			if ((0, _langchain_core_structured_query.isFilterEmpty)(generatedFilter)) return;
			return generatedFilter;
		}
		if ((0, _langchain_core_structured_query.isFilterEmpty)(generatedFilter)) {
			if (forceDefaultFilter) return defaultFilter;
			if (mergeType === "and") return;
			return defaultFilter;
		}
		if (mergeType === "and") return { $and: [defaultFilter, generatedFilter] };
		else if (mergeType === "or") return { $or: [defaultFilter, generatedFilter] };
		else throw new Error("Unknown merge type");
	}
};

//#endregion
exports.ChromaTranslator = ChromaTranslator;
Object.defineProperty(exports, 'chroma_exports', {
  enumerable: true,
  get: function () {
    return chroma_exports;
  }
});
//# sourceMappingURL=chroma.cjs.map