Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_indexing = require("@langchain/core/indexing");

//#region src/indexes/base.ts
var base_exports = /* @__PURE__ */ require_runtime.__exportAll({
	RecordManager: () => _langchain_core_indexing.RecordManager,
	UUIDV5_NAMESPACE: () => _langchain_core_indexing.UUIDV5_NAMESPACE
});

//#endregion
Object.defineProperty(exports, 'RecordManager', {
  enumerable: true,
  get: function () {
    return _langchain_core_indexing.RecordManager;
  }
});
Object.defineProperty(exports, 'UUIDV5_NAMESPACE', {
  enumerable: true,
  get: function () {
    return _langchain_core_indexing.UUIDV5_NAMESPACE;
  }
});
Object.defineProperty(exports, 'base_exports', {
  enumerable: true,
  get: function () {
    return base_exports;
  }
});
//# sourceMappingURL=base.cjs.map