Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region src/agents/format_scratchpad/xml.ts
var xml_exports = /* @__PURE__ */ require("../../_virtual/_rolldown/runtime.cjs").__exportAll({ formatXml: () => formatXml });
function formatXml(intermediateSteps) {
	let log = "";
	for (const step of intermediateSteps) {
		const { action, observation } = step;
		log += `<tool>${action.tool}</tool><tool_input>${action.toolInput}\n</tool_input><observation>${observation}</observation>`;
	}
	return log;
}
//#endregion
exports.formatXml = formatXml;
Object.defineProperty(exports, "xml_exports", {
	enumerable: true,
	get: function() {
		return xml_exports;
	}
});

//# sourceMappingURL=xml.cjs.map