Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_tools = require("@langchain/core/tools");

//#region src/tools/wolframalpha.ts
var wolframalpha_exports = /* @__PURE__ */ require_runtime.__exportAll({ WolframAlphaTool: () => WolframAlphaTool });
/**
* @example
* ```typescript
* const tool = new WolframAlphaTool({
*   appid: "YOUR_APP_ID",
* });
* const res = await tool.invoke("What is 2 * 2?");
* ```
*/
var WolframAlphaTool = class extends _langchain_core_tools.Tool {
	appid;
	name = "wolfram_alpha";
	description = `A wrapper around Wolfram Alpha. Useful for when you need to answer questions about Math, Science, Technology, Culture, Society and Everyday Life. Input should be a search query.`;
	constructor(fields) {
		super(fields);
		this.appid = fields.appid;
	}
	static lc_name() {
		return "WolframAlphaTool";
	}
	async _call(query) {
		const url = `https://www.wolframalpha.com/api/v1/llm-api?appid=${this.appid}&input=${encodeURIComponent(query)}`;
		return (await fetch(url)).text();
	}
};

//#endregion
exports.WolframAlphaTool = WolframAlphaTool;
Object.defineProperty(exports, 'wolframalpha_exports', {
  enumerable: true,
  get: function () {
    return wolframalpha_exports;
  }
});
//# sourceMappingURL=wolframalpha.cjs.map