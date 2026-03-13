Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');

//#region src/embeddings/fake.ts
var fake_exports = /* @__PURE__ */ require_runtime.__exportAll({});
require_runtime.__reExport(fake_exports, require("@langchain/core/utils/testing"));

//#endregion
Object.defineProperty(exports, 'fake_exports', {
  enumerable: true,
  get: function () {
    return fake_exports;
  }
});
var _langchain_core_utils_testing = require("@langchain/core/utils/testing");
Object.keys(_langchain_core_utils_testing).forEach(function (k) {
  if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return _langchain_core_utils_testing[k]; }
  });
});

//# sourceMappingURL=fake.cjs.map