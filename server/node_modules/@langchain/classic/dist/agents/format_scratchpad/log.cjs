Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');

//#region src/agents/format_scratchpad/log.ts
var log_exports = /* @__PURE__ */ require_runtime.__exportAll({ formatLogToString: () => formatLogToString });
/**
* Construct the scratchpad that lets the agent continue its thought process.
* @param intermediateSteps
* @param observationPrefix
* @param llmPrefix
* @returns a string with the formatted observations and agent logs
*/
function formatLogToString(intermediateSteps, observationPrefix = "Observation: ", llmPrefix = "Thought: ") {
	return intermediateSteps.reduce((thoughts, { action, observation }) => thoughts + [
		action.log,
		`\n${observationPrefix}${observation}`,
		llmPrefix
	].join("\n"), "");
}

//#endregion
exports.formatLogToString = formatLogToString;
Object.defineProperty(exports, 'log_exports', {
  enumerable: true,
  get: function () {
    return log_exports;
  }
});
//# sourceMappingURL=log.cjs.map