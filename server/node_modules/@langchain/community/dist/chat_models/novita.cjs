Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_env = require("@langchain/core/utils/env");
let _langchain_openai = require("@langchain/openai");

//#region src/chat_models/novita.ts
var novita_exports = /* @__PURE__ */ require_runtime.__exportAll({ ChatNovitaAI: () => ChatNovitaAI });
/**
* Novita chat model implementation
*/
var ChatNovitaAI = class extends _langchain_openai.ChatOpenAICompletions {
	static lc_name() {
		return "ChatNovita";
	}
	_llmType() {
		return "novita";
	}
	get lc_secrets() {
		return {
			novitaApiKey: "NOVITA_API_KEY",
			apiKey: "NOVITA_API_KEY"
		};
	}
	lc_serializable = true;
	constructor(fields) {
		const novitaApiKey = fields?.apiKey || fields?.novitaApiKey || (0, _langchain_core_utils_env.getEnvironmentVariable)("NOVITA_API_KEY");
		if (!novitaApiKey) throw new Error(`Novita API key not found. Please set the NOVITA_API_KEY environment variable or provide the key into "novitaApiKey"`);
		super({
			...fields,
			model: fields?.model || "gryphe/mythomax-l2-13b",
			apiKey: novitaApiKey,
			configuration: { baseURL: "https://api.novita.ai/v3/openai/" }
		});
	}
	getLsParams(options) {
		const params = super.getLsParams(options);
		params.ls_provider = "novita";
		return params;
	}
	toJSON() {
		const result = super.toJSON();
		if ("kwargs" in result && typeof result.kwargs === "object" && result.kwargs != null) {
			delete result.kwargs.openai_api_key;
			delete result.kwargs.configuration;
		}
		return result;
	}
	async completionWithRetry(request, options) {
		delete request.frequency_penalty;
		delete request.presence_penalty;
		delete request.logit_bias;
		delete request.functions;
		if (request.stream === true) return super.completionWithRetry(request, options);
		return super.completionWithRetry(request, options);
	}
};

//#endregion
exports.ChatNovitaAI = ChatNovitaAI;
Object.defineProperty(exports, 'novita_exports', {
  enumerable: true,
  get: function () {
    return novita_exports;
  }
});
//# sourceMappingURL=novita.cjs.map