Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_openai = require("@langchain/openai");
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_classic_document_loaders_fs_buffer = require("@langchain/classic/document_loaders/fs/buffer");

//#region src/document_loaders/fs/openai_whisper_audio.ts
var openai_whisper_audio_exports = /* @__PURE__ */ require_runtime.__exportAll({ OpenAIWhisperAudio: () => OpenAIWhisperAudio });
const MODEL_NAME = "whisper-1";
/**
* @example
* ```typescript
* const loader = new OpenAIWhisperAudio(
*   "./src/document_loaders/example_data/test.mp3",
* );
* const docs = await loader.load();
* console.log(docs);
* ```
*/
var OpenAIWhisperAudio = class extends _langchain_classic_document_loaders_fs_buffer.BufferLoader {
	openAIClient;
	transcriptionCreateParams;
	constructor(filePathOrBlob, fields) {
		super(filePathOrBlob);
		this.openAIClient = new _langchain_openai.OpenAIClient(fields?.clientOptions);
		this.transcriptionCreateParams = fields?.transcriptionCreateParams ?? {};
	}
	async parse(raw, metadata) {
		const fileName = metadata.source === "blob" ? metadata.blobType : metadata.source;
		return [new _langchain_core_documents.Document({
			pageContent: (await this.openAIClient.audio.transcriptions.create({
				file: await (0, _langchain_openai.toFile)(raw, fileName),
				model: MODEL_NAME,
				...this.transcriptionCreateParams
			})).text,
			metadata
		})];
	}
};

//#endregion
exports.OpenAIWhisperAudio = OpenAIWhisperAudio;
Object.defineProperty(exports, 'openai_whisper_audio_exports', {
  enumerable: true,
  get: function () {
    return openai_whisper_audio_exports;
  }
});
//# sourceMappingURL=openai_whisper_audio.cjs.map