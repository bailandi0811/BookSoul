Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_prompt = require('../chat_convo/prompt.cjs');
let _langchain_core_messages = require("@langchain/core/messages");
let _langchain_core_prompts = require("@langchain/core/prompts");

//#region src/agents/format_scratchpad/openai_functions.ts
var openai_functions_exports = /* @__PURE__ */ require_runtime.__exportAll({
	formatForOpenAIFunctions: () => formatForOpenAIFunctions,
	formatToOpenAIFunctionMessages: () => formatToOpenAIFunctionMessages
});
/**
* Format a list of AgentSteps into a list of BaseMessage instances for
* agents that use OpenAI's API. Helpful for passing in previous agent
* step context into new iterations.
*
* @param steps A list of AgentSteps to format.
* @returns A list of BaseMessages.
*/
function formatForOpenAIFunctions(steps) {
	const thoughts = [];
	for (const step of steps) {
		thoughts.push(new _langchain_core_messages.AIMessage(step.action.log));
		thoughts.push(new _langchain_core_messages.HumanMessage((0, _langchain_core_prompts.renderTemplate)(require_prompt.TEMPLATE_TOOL_RESPONSE, "f-string", { observation: step.observation })));
	}
	return thoughts;
}
/**
* Format a list of AgentSteps into a list of BaseMessage instances for
* agents that use OpenAI's API. Helpful for passing in previous agent
* step context into new iterations.
*
* @param steps A list of AgentSteps to format.
* @returns A list of BaseMessages.
*/
function formatToOpenAIFunctionMessages(steps) {
	return steps.flatMap(({ action, observation }) => {
		if ("messageLog" in action && action.messageLog !== void 0) return action.messageLog.concat(new _langchain_core_messages.FunctionMessage(observation, action.tool));
		else return [new _langchain_core_messages.AIMessage(action.log)];
	});
}

//#endregion
exports.formatForOpenAIFunctions = formatForOpenAIFunctions;
exports.formatToOpenAIFunctionMessages = formatToOpenAIFunctionMessages;
Object.defineProperty(exports, 'openai_functions_exports', {
  enumerable: true,
  get: function () {
    return openai_functions_exports;
  }
});
//# sourceMappingURL=openai_functions.cjs.map