import { BaseBedrockInput } from "../../utils/bedrock/index.js";
import { Bedrock as Bedrock$1 } from "./web.js";
import { BaseLLMParams } from "@langchain/core/language_models/llms";

//#region src/llms/bedrock/index.d.ts
declare class Bedrock extends Bedrock$1 {
  static lc_name(): string;
  constructor(fields?: Partial<BaseBedrockInput> & BaseLLMParams);
}
//#endregion
export { Bedrock };
//# sourceMappingURL=index.d.ts.map