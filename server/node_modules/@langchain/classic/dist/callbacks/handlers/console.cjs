const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');

//#region src/callbacks/handlers/console.ts
var console_exports = /* @__PURE__ */ require_runtime.__exportAll({});
require_runtime.__reExport(console_exports, require("@langchain/core/tracers/console"));

//#endregion
Object.defineProperty(exports, 'console_exports', {
  enumerable: true,
  get: function () {
    return console_exports;
  }
});
var _langchain_core_tracers_console = require("@langchain/core/tracers/console");
Object.keys(_langchain_core_tracers_console).forEach(function (k) {
  if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return _langchain_core_tracers_console[k]; }
  });
});

//# sourceMappingURL=console.cjs.map