Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_core_documents = require("@langchain/core/documents");
let _google_cloud_storage = require("@google-cloud/storage");
let _langchain_classic_stores_doc_base = require("@langchain/classic/stores/doc/base");

//#region src/stores/doc/gcs.ts
var gcs_exports = /* @__PURE__ */ require_runtime.__exportAll({ GoogleCloudStorageDocstore: () => GoogleCloudStorageDocstore });
/**
* Class that provides an interface for interacting with Google Cloud
* Storage (GCS) as a document store. It extends the Docstore class and
* implements methods to search, add, and add a document to the GCS
* bucket.
*/
var GoogleCloudStorageDocstore = class extends _langchain_classic_stores_doc_base.Docstore {
	bucket;
	prefix = "";
	storage;
	constructor(config) {
		super();
		this.bucket = config.bucket;
		this.prefix = config.prefix ?? this.prefix;
		this.storage = new _google_cloud_storage.Storage();
	}
	/**
	* Searches for a document in the GCS bucket and returns it as a Document
	* instance.
	* @param search The name of the document to search for in the GCS bucket
	* @returns A Promise that resolves to a Document instance representing the found document
	*/
	async search(search) {
		const file = this.getFile(search);
		const [fileMetadata] = await file.getMetadata();
		const metadata = fileMetadata?.metadata;
		const [dataBuffer] = await file.download();
		return new _langchain_core_documents.Document({
			pageContent: dataBuffer.toString(),
			metadata
		});
	}
	/**
	* Adds multiple documents to the GCS bucket.
	* @param texts An object where each key is the name of a document and the value is the Document instance to be added
	* @returns A Promise that resolves when all documents have been added
	*/
	async add(texts) {
		await Promise.all(Object.keys(texts).map((key) => this.addDocument(key, texts[key])));
	}
	/**
	* Adds a single document to the GCS bucket.
	* @param name The name of the document to be added
	* @param document The Document instance to be added
	* @returns A Promise that resolves when the document has been added
	*/
	async addDocument(name, document) {
		const file = this.getFile(name);
		await file.save(document.pageContent);
		await file.setMetadata({ metadata: document.metadata });
	}
	/**
	* Gets a file from the GCS bucket.
	* @param name The name of the file to get from the GCS bucket
	* @returns A File instance representing the fetched file
	*/
	getFile(name) {
		const filename = this.prefix + name;
		return this.storage.bucket(this.bucket).file(filename);
	}
};

//#endregion
exports.GoogleCloudStorageDocstore = GoogleCloudStorageDocstore;
Object.defineProperty(exports, 'gcs_exports', {
  enumerable: true,
  get: function () {
    return gcs_exports;
  }
});
//# sourceMappingURL=gcs.cjs.map