import { __exportAll } from "../../_virtual/_rolldown/runtime.js";
import { Bedrock as Bedrock$1 } from "./web.js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

//#region src/llms/bedrock/index.ts
var bedrock_exports = /* @__PURE__ */ __exportAll({ Bedrock: () => Bedrock });
var Bedrock = class extends Bedrock$1 {
	static lc_name() {
		return "Bedrock";
	}
	constructor(fields) {
		super({
			...fields,
			credentials: fields?.credentials ?? defaultProvider()
		});
	}
};

//#endregion
export { Bedrock, bedrock_exports };
//# sourceMappingURL=index.js.map