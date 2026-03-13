Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_util_document = require('../util/document.cjs');
let _langchain_core_tools = require("@langchain/core/tools");
let zod_v3 = require("zod/v3");

//#region src/tools/retriever.ts
var retriever_exports = /* @__PURE__ */ require_runtime.__exportAll({ createRetrieverTool: () => createRetrieverTool });
function createRetrieverTool(retriever, input) {
	const func = async ({ query }, runManager) => {
		return require_util_document.formatDocumentsAsString(await retriever.invoke(query, runManager?.getChild("retriever")));
	};
	const schema = zod_v3.z.object({ query: zod_v3.z.string().describe("query to look up in retriever") });
	return new _langchain_core_tools.DynamicStructuredTool({
		...input,
		func,
		schema
	});
}

//#endregion
exports.createRetrieverTool = createRetrieverTool;
Object.defineProperty(exports, 'retriever_exports', {
  enumerable: true,
  get: function () {
    return retriever_exports;
  }
});
//# sourceMappingURL=retriever.cjs.map