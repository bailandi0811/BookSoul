Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');

//#region src/memory/chat_memory.ts
var chat_memory_exports = /* @__PURE__ */ require_runtime.__exportAll({});
require_runtime.__reExport(chat_memory_exports, require("@langchain/classic/memory/chat_memory"));

//#endregion
Object.defineProperty(exports, 'chat_memory_exports', {
  enumerable: true,
  get: function () {
    return chat_memory_exports;
  }
});
var _langchain_classic_memory_chat_memory = require("@langchain/classic/memory/chat_memory");
Object.keys(_langchain_classic_memory_chat_memory).forEach(function (k) {
  if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
    enumerable: true,
    get: function () { return _langchain_classic_memory_chat_memory[k]; }
  });
});

//# sourceMappingURL=chat_memory.cjs.map