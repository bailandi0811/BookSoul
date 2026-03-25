import { Optional } from "./type-utils.cjs";
import { BaseServiceParams } from "assemblyai";
export * from "assemblyai";

//#region src/types/assemblyai-types.d.ts
type AssemblyAIOptions = Optional<BaseServiceParams, "apiKey">;
//#endregion
export { AssemblyAIOptions };
//# sourceMappingURL=assemblyai-types.d.cts.map