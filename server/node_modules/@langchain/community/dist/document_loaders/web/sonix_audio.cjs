Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");
let sonix_speech_recognition = require("sonix-speech-recognition");

//#region src/document_loaders/web/sonix_audio.ts
var sonix_audio_exports = /* @__PURE__ */ require_runtime.__exportAll({ SonixAudioTranscriptionLoader: () => SonixAudioTranscriptionLoader });
/**
* A class that represents a document loader for transcribing audio files
* using the Sonix Speech Recognition service.
* @example
* ```typescript
* const loader = new SonixAudioTranscriptionLoader({
*   sonixAuthKey: "SONIX_AUTH_KEY",
*   request: {
*     audioFilePath: "LOCAL_AUDIO_FILE_PATH",
*     fileName: "FILE_NAME",
*     language: "en",
*   },
* });
* const docs = await loader.load();
* ```
*/
var SonixAudioTranscriptionLoader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	sonixSpeechRecognitionService;
	speechToTextRequest;
	constructor({ sonixAuthKey, request: speechToTextRequest }) {
		super();
		this.sonixSpeechRecognitionService = new sonix_speech_recognition.SonixSpeechRecognitionService(sonixAuthKey);
		this.speechToTextRequest = speechToTextRequest;
	}
	/**
	* Performs the speech-to-text transcription using the
	* SonixSpeechRecognitionService and returns the transcribed text as a
	* Document object.
	* @returns An array of Document objects containing the transcribed text.
	*/
	async load() {
		const { text, status, error } = await this.sonixSpeechRecognitionService.speechToText(this.speechToTextRequest);
		if (status === "failed") throw new Error(`Failed to transcribe audio file. Error: ${error}`);
		return [new _langchain_core_documents.Document({
			pageContent: text,
			metadata: { fileName: this.speechToTextRequest.fileName }
		})];
	}
};

//#endregion
exports.SonixAudioTranscriptionLoader = SonixAudioTranscriptionLoader;
Object.defineProperty(exports, 'sonix_audio_exports', {
  enumerable: true,
  get: function () {
    return sonix_audio_exports;
  }
});
//# sourceMappingURL=sonix_audio.cjs.map