import { __exportAll } from "../../_virtual/_rolldown/runtime.js";

//#region src/agents/format_scratchpad/log.ts
var log_exports = /* @__PURE__ */ __exportAll({ formatLogToString: () => formatLogToString });
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
export { formatLogToString, log_exports };
//# sourceMappingURL=log.js.map