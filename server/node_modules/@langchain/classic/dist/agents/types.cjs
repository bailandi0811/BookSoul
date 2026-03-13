const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_output_parsers = require("@langchain/core/output_parsers");

//#region src/agents/types.ts
/**
* Abstract class representing an output parser specifically for agent
* actions and finishes in LangChain. It extends the `BaseOutputParser`
* class.
*/
var AgentActionOutputParser = class extends _langchain_core_output_parsers.BaseOutputParser {};
/**
* Abstract class representing an output parser specifically for agents
* that return multiple actions.
*/
var AgentMultiActionOutputParser = class extends _langchain_core_output_parsers.BaseOutputParser {};

//#endregion
exports.AgentActionOutputParser = AgentActionOutputParser;
exports.AgentMultiActionOutputParser = AgentMultiActionOutputParser;
//# sourceMappingURL=types.cjs.map