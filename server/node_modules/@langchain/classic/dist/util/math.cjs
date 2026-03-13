Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');

//#region src/util/math.ts
var math_exports = /* @__PURE__ */ require_runtime.__exportAll({});
require_runtime.__reExport(math_exports, require("@langchain/core/utils/math"));

//#endregion
Object.defineProperty(exports, 'math_exports', {
  enumerable: true,
  get: function () {
    return math_exports;
  }
});
var _langchain_core_utils_math = require("@langchain/core/utils/math");
Object.keys(_langchain_core_utils_math).forEach(function (k) {
  if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return _langchain_core_utils_math[k]; }
  });
});

//# sourceMappingURL=math.cjs.map