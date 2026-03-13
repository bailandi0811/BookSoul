const require_runtime = require('../../../_virtual/_rolldown/runtime.cjs');
const require_util_document = require('../../../util/document.cjs');
let _langchain_core_tools = require("@langchain/core/tools");
let zod = require("zod");

//#region src/agents/toolkits/conversational_retrieval/tool.ts
function createRetrieverTool(retriever, input) {
	const func = async ({ input }, runManager) => {
		return require_util_document.formatDocumentsAsString(await retriever.invoke(input, runManager?.getChild("retriever")));
	};
	const schema = zod.z.object({ input: zod.z.string().describe("Natural language query used as input to the retriever") });
	return new _langchain_core_tools.DynamicStructuredTool({
		...input,
		func,
		schema
	});
}

//#endregion
exports.createRetrieverTool = createRetrieverTool;
//# sourceMappingURL=tool.cjs.map