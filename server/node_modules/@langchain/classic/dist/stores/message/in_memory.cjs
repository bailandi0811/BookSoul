Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_chat_history = require("@langchain/core/chat_history");

//#region src/stores/message/in_memory.ts
var in_memory_exports = /* @__PURE__ */ require_runtime.__exportAll({ ChatMessageHistory: () => _langchain_core_chat_history.InMemoryChatMessageHistory });

//#endregion
Object.defineProperty(exports, 'ChatMessageHistory', {
  enumerable: true,
  get: function () {
    return _langchain_core_chat_history.InMemoryChatMessageHistory;
  }
});
Object.defineProperty(exports, 'in_memory_exports', {
  enumerable: true,
  get: function () {
    return in_memory_exports;
  }
});
//# sourceMappingURL=in_memory.cjs.map