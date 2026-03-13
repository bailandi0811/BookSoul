const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _ibm_cloud_watsonx_ai = require("@ibm-cloud/watsonx-ai");
let _langchain_core_utils_types = require("@langchain/core/utils/types");
let ibm_cloud_sdk_core = require("ibm-cloud-sdk-core");
let _langchain_core_output_parsers_openai_tools = require("@langchain/core/output_parsers/openai_tools");
let _langchain_core_output_parsers = require("@langchain/core/output_parsers");
let zod_v3 = require("zod/v3");
let _ibm_cloud_watsonx_ai_gateway = require("@ibm-cloud/watsonx-ai/gateway");

//#region src/utils/ibm.ts
const createAuthenticator = ({ watsonxAIApikey, watsonxAIAuthType, watsonxAIBearerToken, watsonxAIUsername, watsonxAIPassword, watsonxAIUrl, disableSSL, serviceUrl }) => {
	if (watsonxAIAuthType === "iam" && watsonxAIApikey) return new ibm_cloud_sdk_core.IamAuthenticator({ apikey: watsonxAIApikey });
	else if (watsonxAIAuthType === "bearertoken" && watsonxAIBearerToken) return new ibm_cloud_sdk_core.BearerTokenAuthenticator({ bearerToken: watsonxAIBearerToken });
	else if (watsonxAIAuthType === "cp4d") {
		if (watsonxAIUsername && (watsonxAIPassword || watsonxAIApikey)) return new ibm_cloud_sdk_core.CloudPakForDataAuthenticator({
			username: watsonxAIUsername,
			password: watsonxAIPassword,
			url: (watsonxAIUrl ?? serviceUrl).concat("/icp4d-api/v1/authorize"),
			apikey: watsonxAIApikey,
			disableSslVerification: disableSSL
		});
	}
};
const authenticateAndSetInstance = ({ watsonxAIApikey, watsonxAIAuthType, watsonxAIBearerToken, watsonxAIUsername, watsonxAIPassword, watsonxAIUrl, disableSSL, version, serviceUrl }) => {
	if (watsonxAIAuthType === "iam" && watsonxAIApikey) return _ibm_cloud_watsonx_ai.WatsonXAI.newInstance({
		version,
		serviceUrl,
		authenticator: new ibm_cloud_sdk_core.IamAuthenticator({ apikey: watsonxAIApikey })
	});
	else if (watsonxAIAuthType === "bearertoken" && watsonxAIBearerToken) return _ibm_cloud_watsonx_ai.WatsonXAI.newInstance({
		version,
		serviceUrl,
		authenticator: new ibm_cloud_sdk_core.BearerTokenAuthenticator({ bearerToken: watsonxAIBearerToken })
	});
	else if (watsonxAIAuthType === "cp4d") {
		if (watsonxAIUsername && (watsonxAIPassword || watsonxAIApikey)) {
			const watsonxCPDAuthUrl = watsonxAIUrl ?? serviceUrl;
			return _ibm_cloud_watsonx_ai.WatsonXAI.newInstance({
				version,
				serviceUrl,
				disableSslVerification: disableSSL,
				authenticator: new ibm_cloud_sdk_core.CloudPakForDataAuthenticator({
					username: watsonxAIUsername,
					password: watsonxAIPassword,
					url: watsonxCPDAuthUrl.concat("/icp4d-api/v1/authorize"),
					apikey: watsonxAIApikey,
					disableSslVerification: disableSSL
				})
			});
		}
	} else return _ibm_cloud_watsonx_ai.WatsonXAI.newInstance({
		version,
		serviceUrl
	});
};
function authenticateAndSetGatewayInstance({ watsonxAIApikey, watsonxAIAuthType, watsonxAIBearerToken, watsonxAIUsername, watsonxAIPassword, watsonxAIUrl, disableSSL, version, serviceUrl }) {
	return new _ibm_cloud_watsonx_ai_gateway.Gateway({
		version,
		serviceUrl,
		authenticator: createAuthenticator({
			watsonxAIApikey,
			watsonxAIAuthType,
			watsonxAIBearerToken,
			watsonxAIUsername,
			watsonxAIPassword,
			watsonxAIUrl,
			disableSSL,
			serviceUrl
		})
	});
}
const TOOL_CALL_ID_PATTERN = /^[a-zA-Z0-9]{9}$/;
function _isValidMistralToolCallId(toolCallId) {
	return TOOL_CALL_ID_PATTERN.test(toolCallId);
}
function _base62Encode(num) {
	let numCopy = num;
	const base62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	if (numCopy === 0) return base62[0];
	const arr = [];
	const base = 62;
	while (numCopy) {
		arr.push(base62[numCopy % base]);
		numCopy = Math.floor(numCopy / base);
	}
	return arr.reverse().join("");
}
function _simpleHash(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i += 1) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash &= hash;
	}
	return Math.abs(hash);
}
function _convertToolCallIdToMistralCompatible(toolCallId) {
	if (_isValidMistralToolCallId(toolCallId)) return toolCallId;
	else {
		const base62Str = _base62Encode(_simpleHash(toolCallId));
		if (base62Str.length >= 9) return base62Str.slice(0, 9);
		else return base62Str.padStart(9, "0");
	}
}
var WatsonxToolsOutputParser = class extends _langchain_core_output_parsers_openai_tools.JsonOutputToolsParser {
	static lc_name() {
		return "WatsonxToolsOutputParser";
	}
	lc_namespace = [
		"langchain",
		"watsonx",
		"output_parsers"
	];
	returnId = false;
	keyName;
	returnSingle = false;
	zodSchema;
	latestCorrect;
	constructor(params) {
		super(params);
		this.keyName = params.keyName;
		this.returnSingle = params.returnSingle ?? this.returnSingle;
		this.zodSchema = params.zodSchema;
	}
	async _validateResult(result) {
		let parsedResult = result;
		if (typeof result === "string") try {
			parsedResult = JSON.parse(result);
		} catch (e) {
			throw new _langchain_core_output_parsers.OutputParserException(`Failed to parse. Text: "${JSON.stringify(result, null, 2)}". Error: ${JSON.stringify(e.message)}`, result);
		}
		else parsedResult = result;
		if (this.zodSchema === void 0) return parsedResult;
		const zodParsedResult = await (0, _langchain_core_utils_types.interopSafeParseAsync)(this.zodSchema, parsedResult);
		if (zodParsedResult.success) return zodParsedResult.data;
		else throw new _langchain_core_output_parsers.OutputParserException(`Failed to parse. Text: "${JSON.stringify(result, null, 2)}". Error: ${JSON.stringify(zodParsedResult.error.issues)}`, JSON.stringify(result, null, 2));
	}
	async parsePartialResult(generations) {
		const tools = generations.flatMap((generation) => {
			const message = generation.message;
			if (!Array.isArray(message.tool_calls)) return [];
			return message.tool_calls;
		});
		if (tools[0] === void 0) if (this.latestCorrect) tools.push(this.latestCorrect);
		else tools.push({
			name: "",
			args: {}
		});
		const [tool] = tools;
		tool.name = "";
		this.latestCorrect = tool;
		return tool.args;
	}
};
function jsonSchemaToZod(obj) {
	if (obj?.properties && obj.type === "object") {
		const shape = {};
		Object.keys(obj.properties).forEach((key) => {
			if (obj.properties) {
				const prop = obj.properties[key];
				let zodType;
				if (prop.type === "string") {
					zodType = zod_v3.z.string();
					if (prop?.pattern) zodType = zodType.regex(prop.pattern, "Invalid pattern");
				} else if (prop.type === "number" || prop.type === "integer" || prop.type === "float") {
					zodType = zod_v3.z.number();
					if (typeof prop?.minimum === "number") zodType = zodType.min(prop.minimum, { message: `${key} must be at least ${prop.minimum}` });
					if (prop?.maximum) zodType = zodType.lte(prop.maximum, { message: `${key} must be maximum of ${prop.maximum}` });
				} else if (prop.type === "boolean") zodType = zod_v3.z.boolean();
				else if (prop.type === "array") zodType = zod_v3.z.array(prop.items ? jsonSchemaToZod(prop.items) : zod_v3.z.string());
				else if (prop.type === "object") zodType = jsonSchemaToZod(prop);
				else throw new Error(`Unsupported type: ${prop.type}`);
				if (prop.description) zodType = zodType.describe(prop.description);
				if (!obj.required?.includes(key)) zodType = zodType.optional();
				shape[key] = zodType;
			}
		});
		return zod_v3.z.object(shape);
	}
	throw new Error("Unsupported root schema type");
}
const expectOneOf = (params, keys, exactlyOneOf = false) => {
	const provided = keys.filter((key) => key in params && params[key] !== void 0);
	if (exactlyOneOf && provided.length !== 1) throw new Error(`Expected exactly one of: ${keys.join(", ")}. Got: ${provided.join(", ")}`);
	else if (!exactlyOneOf && provided.length > 1) throw new Error(`Expected one of: ${keys.join(", ")} or none. Got: ${provided.join(", ")}`);
};
const checkValidProps = (params, allowedKeys) => {
	const unexpected = Object.keys(params).filter((key) => !allowedKeys.includes(key));
	if (unexpected.length > 0) throw new Error(`Unexpected properties: ${unexpected.join(", ")}. Expected only: ${allowedKeys.join(", ")}.`);
};

//#endregion
exports.WatsonxToolsOutputParser = WatsonxToolsOutputParser;
exports._convertToolCallIdToMistralCompatible = _convertToolCallIdToMistralCompatible;
exports.authenticateAndSetGatewayInstance = authenticateAndSetGatewayInstance;
exports.authenticateAndSetInstance = authenticateAndSetInstance;
exports.checkValidProps = checkValidProps;
exports.expectOneOf = expectOneOf;
exports.jsonSchemaToZod = jsonSchemaToZod;
//# sourceMappingURL=ibm.cjs.map