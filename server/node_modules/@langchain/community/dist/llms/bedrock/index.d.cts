import { BaseBedrockInput } from "../../utils/bedrock/index.cjs";
import { Bedrock as Bedrock$1 } from "./web.cjs";
import { BaseLLMParams } from "@langchain/core/language_models/llms";

//#region src/llms/bedrock/index.d.ts
declare class Bedrock extends Bedrock$1 {
  static lc_name(): string;
  constructor(fields?: Partial<BaseBedrockInput> & BaseLLMParams);
}
//#endregion
export { Bedrock };
//# sourceMappingURL=index.d.cts.map