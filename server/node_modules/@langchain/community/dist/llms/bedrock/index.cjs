Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_llms_bedrock_web = require('./web.cjs');
let _aws_sdk_credential_provider_node = require("@aws-sdk/credential-provider-node");

//#region src/llms/bedrock/index.ts
var bedrock_exports = /* @__PURE__ */ require_runtime.__exportAll({ Bedrock: () => Bedrock });
var Bedrock = class extends require_llms_bedrock_web.Bedrock {
	static lc_name() {
		return "Bedrock";
	}
	constructor(fields) {
		super({
			...fields,
			credentials: fields?.credentials ?? (0, _aws_sdk_credential_provider_node.defaultProvider)()
		});
	}
};

//#endregion
exports.Bedrock = Bedrock;
Object.defineProperty(exports, 'bedrock_exports', {
  enumerable: true,
  get: function () {
    return bedrock_exports;
  }
});
//# sourceMappingURL=index.cjs.map