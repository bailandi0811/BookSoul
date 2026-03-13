Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');

//#region src/stores/doc/in_memory.ts
var in_memory_exports = /* @__PURE__ */ require_runtime.__exportAll({});
require_runtime.__reExport(in_memory_exports, require("@langchain/classic/stores/doc/in_memory"));

//#endregion
Object.defineProperty(exports, 'in_memory_exports', {
  enumerable: true,
  get: function () {
    return in_memory_exports;
  }
});
var _langchain_classic_stores_doc_in_memory = require("@langchain/classic/stores/doc/in_memory");
Object.keys(_langchain_classic_stores_doc_in_memory).forEach(function (k) {
  if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return _langchain_classic_stores_doc_in_memory[k]; }
  });
});

//# sourceMappingURL=in_memory.cjs.map