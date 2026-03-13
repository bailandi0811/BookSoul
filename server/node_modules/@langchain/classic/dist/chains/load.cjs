Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_base = require('./base.cjs');
const require_hub = require('../util/hub.cjs');
const require_load = require('../util/load.cjs');
const require_parse = require('../util/parse.cjs');

//#region src/chains/load.ts
var load_exports = /* @__PURE__ */ require_runtime.__exportAll({ loadChain: () => loadChain });
const loadChainFromFile = async (file, path, values = {}) => {
	const serialized = require_parse.parseFileConfig(file, path);
	return require_base.BaseChain.deserialize(serialized, values);
};
/**
* Load a chain from {@link https://github.com/hwchase17/langchain-hub | LangchainHub} or local filesystem.
*
* @example
* Loading from LangchainHub:
* ```ts
* import { loadChain } from "@langchain/classic/chains/load";
* const chain = await loadChain("lc://chains/hello-world/chain.json");
* const res = await chain.call({ topic: "my favorite color" });
* ```
*
* @example
* Loading from local filesystem:
* ```ts
* import { loadChain } from "@langchain/classic/chains/load";
* const chain = await loadChain("/path/to/chain.json");
* ```
*/
const loadChain = async (uri, values = {}) => {
	const hubResult = await require_hub.loadFromHub(uri, loadChainFromFile, "chains", new Set(["json", "yaml"]), values);
	if (hubResult) return hubResult;
	return require_load.loadFromFile(uri, loadChainFromFile, values);
};

//#endregion
exports.loadChain = loadChain;
Object.defineProperty(exports, 'load_exports', {
  enumerable: true,
  get: function () {
    return load_exports;
  }
});
//# sourceMappingURL=load.cjs.map