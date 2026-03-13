import { Agent } from "./agent.cjs";
import { BaseLanguageModelInterface } from "@langchain/core/language_models/base";
import { ToolInterface } from "@langchain/core/tools";

//#region src/agents/load.d.ts
declare function loadAgent(uri: string, llmAndTools?: {
  llm?: BaseLanguageModelInterface;
  tools?: ToolInterface[];
}): Promise<Agent>;
//#endregion
export { loadAgent };
//# sourceMappingURL=load.d.cts.map