Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
const require_import_map = require('./import_map.cjs');
const require_import_constants = require('./import_constants.cjs');
let _langchain_core_load = require("@langchain/core/load");

//#region src/load/index.ts
/**
* Load a LangChain module from a serialized text representation.
* NOTE: This functionality is currently in beta.
* Loaded classes may change independently of semver.
* @param text Serialized text representation of the module.
* @param secretsMap
* @param optionalImportsMap
* @returns A loaded instance of a LangChain module.
*/
async function load(text, secretsMap = {}, optionalImportsMap = {}) {
	return (0, _langchain_core_load.load)(text, {
		secretsMap,
		optionalImportsMap,
		optionalImportEntrypoints: require_import_constants.optionalImportEntrypoints,
		importMap: require_import_map.import_map_exports
	});
}

//#endregion
exports.load = load;
//# sourceMappingURL=index.cjs.map