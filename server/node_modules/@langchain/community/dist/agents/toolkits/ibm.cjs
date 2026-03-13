Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_ibm = require('../../utils/ibm.cjs');
let _langchain_core_tools = require("@langchain/core/tools");
let _ibm_cloud_watsonx_ai = require("@ibm-cloud/watsonx-ai");
let _langchain_core_utils_types = require("@langchain/core/utils/types");

//#region src/agents/toolkits/ibm.ts
var ibm_exports = /* @__PURE__ */ require_runtime.__exportAll({
	WatsonxTool: () => WatsonxTool,
	WatsonxToolkit: () => WatsonxToolkit
});
var WatsonxTool = class extends _langchain_core_tools.StructuredTool {
	name;
	description;
	service;
	schema;
	configSchema;
	toolConfig;
	constructor(fields, service, configSchema) {
		super();
		this.name = fields?.name;
		this.description = fields?.description || "";
		this.schema = require_ibm.jsonSchemaToZod(fields?.parameters);
		this.configSchema = configSchema ? require_ibm.jsonSchemaToZod(configSchema) : void 0;
		this.service = service;
	}
	async _call(inputObject) {
		const { input } = inputObject;
		const result = (await this.service.runUtilityAgentToolByName({
			toolId: this.name,
			wxUtilityAgentToolsRunRequest: {
				input: input ?? inputObject,
				tool_name: this.name,
				config: this.toolConfig
			}
		}))?.result.output;
		return new Promise((resolve) => {
			resolve(result ?? "Sorry, the tool did not work as expected");
		});
	}
	set config(config) {
		if (!this.configSchema) {
			this.toolConfig = config;
			return;
		}
		this.toolConfig = (0, _langchain_core_utils_types.interopSafeParse)(this.configSchema, config).data;
	}
};
var WatsonxToolkit = class WatsonxToolkit extends _langchain_core_tools.BaseToolkit {
	tools;
	service;
	constructor(fields) {
		super();
		const { watsonxAIApikey, watsonxAIAuthType, watsonxAIBearerToken, watsonxAIUsername, watsonxAIPassword, watsonxAIUrl, version, disableSSL, serviceUrl } = fields;
		const auth = require_ibm.authenticateAndSetInstance({
			watsonxAIApikey,
			watsonxAIAuthType,
			watsonxAIBearerToken,
			watsonxAIUsername,
			watsonxAIPassword,
			watsonxAIUrl,
			disableSSL,
			version,
			serviceUrl
		});
		if (auth) this.service = auth;
	}
	async loadTools() {
		const { result: tools } = await this.service.listUtilityAgentTools();
		this.tools = tools.resources.map((tool) => {
			const { function: watsonxTool } = (0, _ibm_cloud_watsonx_ai.convertUtilityToolToWatsonxTool)(tool);
			if (watsonxTool) return new WatsonxTool(watsonxTool, this.service, tool.config_schema);
			else return void 0;
		}).filter((item) => item !== void 0);
	}
	static async init(props) {
		const instance = new WatsonxToolkit({ ...props });
		await instance.loadTools();
		return instance;
	}
	getTools() {
		return this.tools;
	}
	getTool(toolName, config) {
		const selectedTool = this.tools.find((item) => item.name === toolName);
		if (!selectedTool) throw new Error("Tool with provided name does not exist");
		if (config) selectedTool.config = config;
		return selectedTool;
	}
};

//#endregion
exports.WatsonxTool = WatsonxTool;
exports.WatsonxToolkit = WatsonxToolkit;
Object.defineProperty(exports, 'ibm_exports', {
  enumerable: true,
  get: function () {
    return ibm_exports;
  }
});
//# sourceMappingURL=ibm.cjs.map