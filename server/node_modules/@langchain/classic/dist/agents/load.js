import { __exportAll } from "../_virtual/_rolldown/runtime.js";
import { Agent } from "./agent.js";
import { loadFromHub } from "../util/hub.js";
import { loadFromFile } from "../util/load.js";
import { parseFileConfig } from "../util/parse.js";

//#region src/agents/load.ts
var load_exports = /* @__PURE__ */ __exportAll({ loadAgent: () => loadAgent });
const loadAgentFromFile = async (file, path, llmAndTools) => {
	const serialized = parseFileConfig(file, path);
	return Agent.deserialize({
		...serialized,
		...llmAndTools
	});
};
async function loadAgent(uri, llmAndTools) {
	const hubResult = await loadFromHub(uri, loadAgentFromFile, "agents", new Set(["json", "yaml"]), llmAndTools);
	if (hubResult) return hubResult;
	return loadFromFile(uri, loadAgentFromFile, llmAndTools);
}

//#endregion
export { loadAgent, load_exports };
//# sourceMappingURL=load.js.map