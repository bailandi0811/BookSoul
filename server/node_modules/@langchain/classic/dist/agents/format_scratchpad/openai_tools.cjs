Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_tool_calling = require('./tool_calling.cjs');

//#region src/agents/format_scratchpad/openai_tools.ts
var openai_tools_exports = /* @__PURE__ */ require_runtime.__exportAll({ formatToOpenAIToolMessages: () => require_tool_calling.formatToToolMessages });

//#endregion
exports.formatToOpenAIToolMessages = require_tool_calling.formatToToolMessages;
Object.defineProperty(exports, 'openai_tools_exports', {
  enumerable: true,
  get: function () {
    return openai_tools_exports;
  }
});
//# sourceMappingURL=openai_tools.cjs.map