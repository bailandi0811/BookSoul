Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_output_parser = require('../openai_functions/output_parser.cjs');
const require_output_parser$1 = require('../openai_tools/output_parser.cjs');

//#region src/agents/openai/output_parser.ts
var output_parser_exports = /* @__PURE__ */ require_runtime.__exportAll({
	OpenAIFunctionsAgentOutputParser: () => require_output_parser.OpenAIFunctionsAgentOutputParser,
	OpenAIToolsAgentOutputParser: () => require_output_parser$1.OpenAIToolsAgentOutputParser
});

//#endregion
exports.OpenAIFunctionsAgentOutputParser = require_output_parser.OpenAIFunctionsAgentOutputParser;
exports.OpenAIToolsAgentOutputParser = require_output_parser$1.OpenAIToolsAgentOutputParser;
Object.defineProperty(exports, 'output_parser_exports', {
  enumerable: true,
  get: function () {
    return output_parser_exports;
  }
});
//# sourceMappingURL=output_parser.cjs.map