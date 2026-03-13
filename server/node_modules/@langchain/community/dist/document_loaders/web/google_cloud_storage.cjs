Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_document_loaders_fs_unstructured = require('../fs/unstructured.cjs');
let _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");
let node_fs = require("node:fs");
node_fs = require_runtime.__toESM(node_fs);
let node_path = require("node:path");
node_path = require_runtime.__toESM(node_path);
let node_os = require("node:os");
node_os = require_runtime.__toESM(node_os);
let _google_cloud_storage = require("@google-cloud/storage");

//#region src/document_loaders/web/google_cloud_storage.ts
var google_cloud_storage_exports = /* @__PURE__ */ require_runtime.__exportAll({ GoogleCloudStorageLoader: () => GoogleCloudStorageLoader });
/**
* A class that extends the BaseDocumentLoader class. It represents a
* document loader for loading files from a google cloud storage bucket.
* @example
* ```typescript
* const loader = new GoogleCloudStorageLoader({
*   bucket: "<my-bucket-name>",
*   file: "<file-path>",
*   storageOptions: {
*     keyFilename: "<key-file-name-path>"
*   }
*   unstructuredConfig: {
*     apiUrl: "<unstructured-API-URL>",
*     apiKey: "<unstructured-API-key>"
*   }
* });
* const docs = await loader.load();
* ```
*/
var GoogleCloudStorageLoader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	bucket;
	file;
	storageOptions;
	_fs;
	unstructuredLoaderOptions;
	constructor({ fs = node_fs, file, bucket, unstructuredLoaderOptions, storageOptions }) {
		super();
		this._fs = fs;
		this.bucket = bucket;
		this.file = file;
		this.unstructuredLoaderOptions = unstructuredLoaderOptions;
		this.storageOptions = storageOptions;
	}
	async load() {
		const tempDir = this._fs.mkdtempSync(node_path.join(node_os.tmpdir(), "googlecloudstoragefileloader-"));
		const filePath = node_path.join(tempDir, this.file);
		try {
			const [buffer] = await new _google_cloud_storage.Storage(this.storageOptions).bucket(this.bucket).file(this.file).download();
			this._fs.mkdirSync(node_path.dirname(filePath), { recursive: true });
			this._fs.writeFileSync(filePath, buffer);
		} catch (e) {
			throw new Error(`Failed to download file ${this.file} from google cloud storage bucket ${this.bucket}: ${e.message}`);
		}
		try {
			return await new require_document_loaders_fs_unstructured.UnstructuredLoader(filePath, this.unstructuredLoaderOptions).load();
		} catch {
			throw new Error(`Failed to load file ${filePath} using unstructured loader.`);
		}
	}
};

//#endregion
exports.GoogleCloudStorageLoader = GoogleCloudStorageLoader;
Object.defineProperty(exports, 'google_cloud_storage_exports', {
  enumerable: true,
  get: function () {
    return google_cloud_storage_exports;
  }
});
//# sourceMappingURL=google_cloud_storage.cjs.map