import { __exportAll } from "../_virtual/_rolldown/runtime.js";
import { formatDocumentsAsString } from "../util/document.js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod/v3";

//#region src/tools/retriever.ts
var retriever_exports = /* @__PURE__ */ __exportAll({ createRetrieverTool: () => createRetrieverTool });
function createRetrieverTool(retriever, input) {
	const func = async ({ query }, runManager) => {
		return formatDocumentsAsString(await retriever.invoke(query, runManager?.getChild("retriever")));
	};
	const schema = z.object({ query: z.string().describe("query to look up in retriever") });
	return new DynamicStructuredTool({
		...input,
		func,
		schema
	});
}

//#endregion
export { createRetrieverTool, retriever_exports };
//# sourceMappingURL=retriever.js.map