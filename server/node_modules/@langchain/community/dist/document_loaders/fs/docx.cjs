Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _langchain_classic_document_loaders_fs_buffer = require("@langchain/classic/document_loaders/fs/buffer");

//#region src/document_loaders/fs/docx.ts
var docx_exports = /* @__PURE__ */ require_runtime.__exportAll({ DocxLoader: () => DocxLoader });
/**
* A class that extends the `BufferLoader` class. It represents a document
* loader that loads documents from DOCX files.
* It has a constructor that takes a `filePathOrBlob` parameter representing the path to the word
* file or a Blob object, and an optional `options` parameter of type
* `DocxLoaderOptions`
*/
var DocxLoader = class extends _langchain_classic_document_loaders_fs_buffer.BufferLoader {
	options = { type: "docx" };
	constructor(filePathOrBlob, options) {
		super(filePathOrBlob);
		if (options) this.options = { ...options };
	}
	/**
	* A method that takes a `raw` buffer and `metadata` as parameters and
	* returns a promise that resolves to an array of `Document` instances. It
	* uses the `extractRawText` function from the `mammoth` module or
	* `extract` method from the `word-extractor` module to extract
	* the raw text content from the buffer. If the extracted text content is
	* empty, it returns an empty array. Otherwise, it creates a new
	* `Document` instance with the extracted text content and the provided
	* metadata, and returns it as an array.
	* @param raw The raw buffer from which to extract text content.
	* @param metadata The metadata to be associated with the created `Document` instance.
	* @returns A promise that resolves to an array of `Document` instances.
	*/
	async parse(raw, metadata) {
		if (this.options.type === "doc") return this.parseDoc(raw, metadata);
		return this.parseDocx(raw, metadata);
	}
	/**
	* A private method that takes a `raw` buffer and `metadata` as parameters and
	* returns a promise that resolves to an array of `Document` instances. It
	* uses the `extractRawText` function from the `mammoth` module to extract
	* the raw text content from the buffer. If the extracted text content is
	* empty, it returns an empty array. Otherwise, it creates a new
	* `Document` instance with the extracted text content and the provided
	* metadata, and returns it as an array.
	* @param raw The raw buffer from which to extract text content.
	* @param metadata The metadata to be associated with the created `Document` instance.
	* @returns A promise that resolves to an array of `Document` instances.
	*/
	async parseDocx(raw, metadata) {
		if (this.options.type === "doc") return this.parseDoc(raw, metadata);
		const { extractRawText } = await DocxLoaderImports();
		const docx = await extractRawText({ buffer: raw });
		if (!docx.value) return [];
		return [new _langchain_core_documents.Document({
			pageContent: docx.value,
			metadata
		})];
	}
	/**
	* A private method that takes a `raw` buffer and `metadata` as parameters and
	* returns a promise that resolves to an array of `Document` instances. It
	* uses the `extract` method from the `word-extractor` module to extract
	* the raw text content from the buffer. If the extracted text content is
	* empty, it returns an empty array. Otherwise, it creates a new
	* `Document` instance with the extracted text content and the provided
	* metadata, and returns it as an array.
	* @param raw The raw buffer from which to extract text content.
	* @param metadata The metadata to be associated with the created `Document` instance.
	* @returns A promise that resolves to an array of `Document` instances.
	*/
	async parseDoc(raw, metadata) {
		return [new _langchain_core_documents.Document({
			pageContent: (await new (await (DocLoaderImports()))().extract(raw)).getBody(),
			metadata
		})];
	}
};
async function DocxLoaderImports() {
	try {
		const { extractRawText } = await import("mammoth");
		return { extractRawText };
	} catch (e) {
		console.error(e);
		throw new Error("Failed to load mammoth. Please install it with eg. `npm install mammoth`.");
	}
}
async function DocLoaderImports() {
	try {
		return (await import("word-extractor")).default;
	} catch (e) {
		console.error(e);
		throw new Error("Failed to load word-extractor. Please install it with eg. `npm install word-extractor`.");
	}
}

//#endregion
exports.DocxLoader = DocxLoader;
Object.defineProperty(exports, 'docx_exports', {
  enumerable: true,
  get: function () {
    return docx_exports;
  }
});
//# sourceMappingURL=docx.cjs.map