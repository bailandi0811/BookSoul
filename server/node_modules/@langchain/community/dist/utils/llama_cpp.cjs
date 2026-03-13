const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let node_llama_cpp = require("node-llama-cpp");

//#region src/utils/llama_cpp.ts
async function createLlamaModel(inputs, llama) {
	const options = {
		gpuLayers: inputs?.gpuLayers,
		modelPath: inputs.modelPath,
		useMlock: inputs?.useMlock,
		useMmap: inputs?.useMmap,
		vocabOnly: inputs?.vocabOnly
	};
	return llama.loadModel(options);
}
async function createLlamaContext(model, inputs) {
	const options = {
		batchSize: inputs?.batchSize,
		contextSize: inputs?.contextSize,
		threads: inputs?.threads
	};
	return model.createContext(options);
}
async function createLlamaEmbeddingContext(model, inputs) {
	const options = {
		batchSize: inputs?.batchSize,
		contextSize: inputs?.contextSize,
		threads: inputs?.threads
	};
	return model.createEmbeddingContext(options);
}
function createLlamaSession(context) {
	return new node_llama_cpp.LlamaChatSession({ contextSequence: context.getSequence() });
}
async function createLlamaJsonSchemaGrammar(schemaString, llama) {
	if (schemaString === void 0) return;
	const schemaJSON = schemaString;
	return await llama.createGrammarForJsonSchema(schemaJSON);
}
async function createCustomGrammar(filePath, llama) {
	if (filePath === void 0) return;
	return llama.createGrammar({ grammar: filePath });
}

//#endregion
exports.createCustomGrammar = createCustomGrammar;
exports.createLlamaContext = createLlamaContext;
exports.createLlamaEmbeddingContext = createLlamaEmbeddingContext;
exports.createLlamaJsonSchemaGrammar = createLlamaJsonSchemaGrammar;
exports.createLlamaModel = createLlamaModel;
exports.createLlamaSession = createLlamaSession;
//# sourceMappingURL=llama_cpp.cjs.map