Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_utils_env = require("@langchain/core/utils/env");
let _langchain_core_language_models_llms = require("@langchain/core/language_models/llms");
let _gradientai_nodejs_sdk = require("@gradientai/nodejs-sdk");

//#region src/llms/gradient_ai.ts
var gradient_ai_exports = /* @__PURE__ */ require_runtime.__exportAll({ GradientLLM: () => GradientLLM });
/**
* The GradientLLM class is used to interact with Gradient AI inference Endpoint models.
* This requires your Gradient AI Access Token which is autoloaded if not specified.
*/
var GradientLLM = class extends _langchain_core_language_models_llms.LLM {
	static lc_name() {
		return "GradientLLM";
	}
	get lc_secrets() {
		return {
			gradientAccessKey: "GRADIENT_ACCESS_TOKEN",
			workspaceId: "GRADIENT_WORKSPACE_ID"
		};
	}
	modelSlug = "llama2-7b-chat";
	adapterId;
	gradientAccessKey;
	workspaceId;
	inferenceParameters;
	lc_serializable = true;
	model;
	constructor(fields) {
		super(fields);
		this.modelSlug = fields?.modelSlug ?? this.modelSlug;
		this.adapterId = fields?.adapterId;
		this.gradientAccessKey = fields?.gradientAccessKey ?? (0, _langchain_core_utils_env.getEnvironmentVariable)("GRADIENT_ACCESS_TOKEN");
		this.workspaceId = fields?.workspaceId ?? (0, _langchain_core_utils_env.getEnvironmentVariable)("GRADIENT_WORKSPACE_ID");
		this.inferenceParameters = fields.inferenceParameters;
		if (!this.gradientAccessKey) throw new Error("Missing Gradient AI Access Token");
		if (!this.workspaceId) throw new Error("Missing Gradient AI Workspace ID");
	}
	_llmType() {
		return "gradient_ai";
	}
	/**
	* Calls the Gradient AI endpoint and retrieves the result.
	* @param {string} prompt The input prompt.
	* @returns {Promise<string>} A promise that resolves to the generated string.
	*/
	/** @ignore */
	async _call(prompt, _options) {
		await this.setModel();
		return (await this.caller.call(async () => this.model.complete({
			query: prompt,
			...this.inferenceParameters
		}))).generatedOutput;
	}
	async setModel() {
		if (this.model) return;
		const gradient = new _gradientai_nodejs_sdk.Gradient({
			accessToken: this.gradientAccessKey,
			workspaceId: this.workspaceId
		});
		if (this.adapterId) this.model = await gradient.getModelAdapter({ modelAdapterId: this.adapterId });
		else this.model = await gradient.getBaseModel({ baseModelSlug: this.modelSlug });
	}
};

//#endregion
exports.GradientLLM = GradientLLM;
Object.defineProperty(exports, 'gradient_ai_exports', {
  enumerable: true,
  get: function () {
    return gradient_ai_exports;
  }
});
//# sourceMappingURL=gradient_ai.cjs.map