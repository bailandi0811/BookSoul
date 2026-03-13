Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('./_virtual/_rolldown/runtime.cjs');

//#region src/text_splitter.ts
var text_splitter_exports = /* @__PURE__ */ require_runtime.__exportAll({});
require_runtime.__reExport(text_splitter_exports, require("@langchain/textsplitters"));

//#endregion
Object.defineProperty(exports, 'text_splitter_exports', {
  enumerable: true,
  get: function () {
    return text_splitter_exports;
  }
});
var _langchain_textsplitters = require("@langchain/textsplitters");
Object.keys(_langchain_textsplitters).forEach(function (k) {
  if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return _langchain_textsplitters[k]; }
  });
});

//# sourceMappingURL=text_splitter.cjs.map