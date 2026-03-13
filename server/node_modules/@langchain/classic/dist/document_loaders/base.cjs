Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');

//#region src/document_loaders/base.ts
var base_exports = /* @__PURE__ */ require_runtime.__exportAll({});
require_runtime.__reExport(base_exports, require("@langchain/core/document_loaders/base"));

//#endregion
Object.defineProperty(exports, 'base_exports', {
  enumerable: true,
  get: function () {
    return base_exports;
  }
});
var _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");
Object.keys(_langchain_core_document_loaders_base).forEach(function (k) {
  if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return _langchain_core_document_loaders_base[k]; }
  });
});

//# sourceMappingURL=base.cjs.map