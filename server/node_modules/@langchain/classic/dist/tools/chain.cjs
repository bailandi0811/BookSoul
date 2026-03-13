Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_tools = require("@langchain/core/tools");

//#region src/tools/chain.ts
var chain_exports = /* @__PURE__ */ require_runtime.__exportAll({ ChainTool: () => ChainTool });
/**
* Class that extends DynamicTool for creating tools that can run chains.
* Takes an instance of a class that extends BaseChain as a parameter in
* its constructor and uses it to run the chain when its 'func' method is
* called.
*/
var ChainTool = class extends _langchain_core_tools.DynamicTool {
	static lc_name() {
		return "ChainTool";
	}
	chain;
	constructor({ chain, ...rest }) {
		super({
			...rest,
			func: async (input, runManager) => chain.run(input, runManager?.getChild())
		});
		this.chain = chain;
	}
};

//#endregion
exports.ChainTool = ChainTool;
Object.defineProperty(exports, 'chain_exports', {
  enumerable: true,
  get: function () {
    return chain_exports;
  }
});
//# sourceMappingURL=chain.cjs.map