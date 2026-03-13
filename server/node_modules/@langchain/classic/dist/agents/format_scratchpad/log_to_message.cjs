Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_messages = require("@langchain/core/messages");
let _langchain_core_prompts = require("@langchain/core/prompts");

//#region src/agents/format_scratchpad/log_to_message.ts
var log_to_message_exports = /* @__PURE__ */ require_runtime.__exportAll({ formatLogToMessage: () => formatLogToMessage });
function formatLogToMessage(intermediateSteps, templateToolResponse = "{observation}") {
	const stringsInsideBrackets = [...templateToolResponse.matchAll(/{([^}]*)}/g)].map((match) => match[1]);
	if (stringsInsideBrackets.length > 1) throw new Error(`templateToolResponse must contain one input variable: ${templateToolResponse}`);
	const thoughts = [];
	for (const step of intermediateSteps) {
		thoughts.push(new _langchain_core_messages.AIMessage(step.action.log));
		thoughts.push(new _langchain_core_messages.HumanMessage((0, _langchain_core_prompts.renderTemplate)(templateToolResponse, "f-string", { [stringsInsideBrackets[0]]: step.observation })));
	}
	return thoughts;
}

//#endregion
exports.formatLogToMessage = formatLogToMessage;
Object.defineProperty(exports, 'log_to_message_exports', {
  enumerable: true,
  get: function () {
    return log_to_message_exports;
  }
});
//# sourceMappingURL=log_to_message.cjs.map