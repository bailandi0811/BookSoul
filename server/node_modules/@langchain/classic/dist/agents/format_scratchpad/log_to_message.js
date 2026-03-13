import { __exportAll } from "../../_virtual/_rolldown/runtime.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { renderTemplate } from "@langchain/core/prompts";

//#region src/agents/format_scratchpad/log_to_message.ts
var log_to_message_exports = /* @__PURE__ */ __exportAll({ formatLogToMessage: () => formatLogToMessage });
function formatLogToMessage(intermediateSteps, templateToolResponse = "{observation}") {
	const stringsInsideBrackets = [...templateToolResponse.matchAll(/{([^}]*)}/g)].map((match) => match[1]);
	if (stringsInsideBrackets.length > 1) throw new Error(`templateToolResponse must contain one input variable: ${templateToolResponse}`);
	const thoughts = [];
	for (const step of intermediateSteps) {
		thoughts.push(new AIMessage(step.action.log));
		thoughts.push(new HumanMessage(renderTemplate(templateToolResponse, "f-string", { [stringsInsideBrackets[0]]: step.observation })));
	}
	return thoughts;
}

//#endregion
export { formatLogToMessage, log_to_message_exports };
//# sourceMappingURL=log_to_message.js.map