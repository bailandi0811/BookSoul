const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_load_serializable = require("@langchain/core/load/serializable");

//#region src/stores/file/base.ts
/**
* Base class for all file stores. All file stores should extend this
* class.
*/
var BaseFileStore = class extends _langchain_core_load_serializable.Serializable {};

//#endregion
exports.BaseFileStore = BaseFileStore;
//# sourceMappingURL=base.cjs.map