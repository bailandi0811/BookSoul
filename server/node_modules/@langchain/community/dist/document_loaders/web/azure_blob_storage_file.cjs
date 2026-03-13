Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_document_loaders_fs_unstructured = require('../fs/unstructured.cjs');
let _langchain_core_document_loaders_base = require("@langchain/core/document_loaders/base");
let _azure_storage_blob = require("@azure/storage-blob");
let node_fs = require("node:fs");
node_fs = require_runtime.__toESM(node_fs);
let node_path = require("node:path");
node_path = require_runtime.__toESM(node_path);
let node_os = require("node:os");
node_os = require_runtime.__toESM(node_os);

//#region src/document_loaders/web/azure_blob_storage_file.ts
var azure_blob_storage_file_exports = /* @__PURE__ */ require_runtime.__exportAll({ AzureBlobStorageFileLoader: () => AzureBlobStorageFileLoader });
/**
* Class representing a document loader that loads a specific file from
* Azure Blob Storage. It extends the BaseDocumentLoader class and
* implements the DocumentLoader interface.
* @example
* ```typescript
* const loader = new AzureBlobStorageFileLoader({
*   azureConfig: {
*     connectionString: "{connectionString}",
*     container: "{containerName}",
*     blobName: "{blobName}",
*   },
* });
* const docs = await loader.load();
* ```
*/
var AzureBlobStorageFileLoader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	get lc_secrets() {
		return { connectionString: "AZURE_BLOB_CONNECTION_STRING" };
	}
	connectionString;
	container;
	blobName;
	unstructuredConfig;
	constructor({ azureConfig, unstructuredConfig }) {
		super();
		this.connectionString = azureConfig.connectionString;
		this.container = azureConfig.container;
		this.blobName = azureConfig.blobName;
		this.unstructuredConfig = unstructuredConfig;
	}
	/**
	* Method to load a specific file from Azure Blob Storage. It creates a
	* temporary directory, constructs the file path, downloads the file, and
	* loads the documents using the UnstructuredLoader. The loaded documents
	* are returned, and the temporary directory is deleted.
	* @returns An array of documents loaded from the file in Azure Blob Storage.
	*/
	async load() {
		const tempDir = node_fs.mkdtempSync(node_path.join(node_os.tmpdir(), "azureblobfileloader-"));
		const filePath = node_path.join(tempDir, this.blobName);
		try {
			const blobClient = _azure_storage_blob.BlobServiceClient.fromConnectionString(this.connectionString, { userAgentOptions: { userAgentPrefix: "langchainjs-blob-storage-file" } }).getContainerClient(this.container).getBlobClient(this.blobName);
			node_fs.mkdirSync(node_path.dirname(filePath), { recursive: true });
			await blobClient.downloadToFile(filePath);
		} catch (e) {
			throw new Error(`Failed to download file ${this.blobName} from Azure Blob Storage container ${this.container}: ${e.message}`);
		}
		try {
			return await new require_document_loaders_fs_unstructured.UnstructuredLoader(filePath, this.unstructuredConfig).load();
		} catch {
			throw new Error(`Failed to load file ${filePath} using unstructured loader.`);
		} finally {
			node_fs.rmSync(node_path.dirname(filePath), {
				recursive: true,
				force: true
			});
		}
	}
};

//#endregion
exports.AzureBlobStorageFileLoader = AzureBlobStorageFileLoader;
Object.defineProperty(exports, 'azure_blob_storage_file_exports', {
  enumerable: true,
  get: function () {
    return azure_blob_storage_file_exports;
  }
});
//# sourceMappingURL=azure_blob_storage_file.cjs.map