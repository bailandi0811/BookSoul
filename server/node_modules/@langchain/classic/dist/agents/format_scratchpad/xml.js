import { __exportAll } from "../../_virtual/_rolldown/runtime.js";

//#region src/agents/format_scratchpad/xml.ts
var xml_exports = /* @__PURE__ */ __exportAll({ formatXml: () => formatXml });
function formatXml(intermediateSteps) {
	let log = "";
	for (const step of intermediateSteps) {
		const { action, observation } = step;
		log += `<tool>${action.tool}</tool><tool_input>${action.toolInput}\n</tool_input><observation>${observation}</observation>`;
	}
	return log;
}

//#endregion
export { formatXml, xml_exports };
//# sourceMappingURL=xml.js.map