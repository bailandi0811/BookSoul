import { Agent } from "./agent.js";
import { ToolInterface } from "@langchain/core/tools";
import { BaseLanguageModelInterface } from "@langchain/core/language_models/base";

//#region src/agents/load.d.ts
declare function loadAgent(uri: string, llmAndTools?: {
  llm?: BaseLanguageModelInterface;
  tools?: ToolInterface[];
}): Promise<Agent>;
//#endregion
export { loadAgent };
//# sourceMappingURL=load.d.ts.map