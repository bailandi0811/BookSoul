Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_classic_document_loaders_fs_buffer = require("@langchain/classic/document_loaders/fs/buffer");
let officeparser = require("officeparser");

//#region src/document_loaders/fs/pptx.ts
var pptx_exports = /* @__PURE__ */ require_runtime.__exportAll({ PPTXLoader: () => PPTXLoader });
/**
* A class that extends the `BufferLoader` class. It represents a document
* loader that loads documents from PDF files.
*/
var PPTXLoader = class extends _langchain_classic_document_loaders_fs_buffer.BufferLoader {
	constructor(filePathOrBlob) {
		super(filePathOrBlob);
	}
	/**
	* A method that takes a `raw` buffer and `metadata` as parameters and
	* returns a promise that resolves to an array of `Document` instances. It
	* uses the `parseOfficeAsync` function from the `officeparser` module to extract
	* the raw text content from the buffer. If the extracted powerpoint content is
	* empty, it returns an empty array. Otherwise, it creates a new
	* `Document` instance with the extracted powerpoint content and the provided
	* metadata, and returns it as an array.
	* @param raw The buffer to be parsed.
	* @param metadata The metadata of the document.
	* @returns A promise that resolves to an array of `Document` instances.
	*/
	async parse(raw, metadata) {
		const pptx = await (0, officeparser.parseOfficeAsync)(raw, { outputErrorToConsole: true });
		if (!pptx) return [];
		return [new _langchain_core_documents.Document({
			pageContent: pptx,
			metadata
		})];
	}
};

//#endregion
exports.PPTXLoader = PPTXLoader;
Object.defineProperty(exports, 'pptx_exports', {
  enumerable: true,
  get: function () {
    return pptx_exports;
  }
});
//# sourceMappingURL=pptx.cjs.map