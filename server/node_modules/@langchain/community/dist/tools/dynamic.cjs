Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_tools = require("@langchain/core/tools");

//#region src/tools/dynamic.ts
var dynamic_exports = /* @__PURE__ */ require_runtime.__exportAll({
	DynamicStructuredTool: () => _langchain_core_tools.DynamicStructuredTool,
	DynamicTool: () => _langchain_core_tools.DynamicTool
});

//#endregion
Object.defineProperty(exports, 'DynamicStructuredTool', {
  enumerable: true,
  get: function () {
    return _langchain_core_tools.DynamicStructuredTool;
  }
});
Object.defineProperty(exports, 'DynamicTool', {
  enumerable: true,
  get: function () {
    return _langchain_core_tools.DynamicTool;
  }
});
Object.defineProperty(exports, 'dynamic_exports', {
  enumerable: true,
  get: function () {
    return dynamic_exports;
  }
});
//# sourceMappingURL=dynamic.cjs.map