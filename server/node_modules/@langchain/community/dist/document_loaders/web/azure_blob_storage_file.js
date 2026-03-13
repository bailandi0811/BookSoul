import { __exportAll } from "../../_virtual/_rolldown/runtime.js";
import { UnstructuredLoader } from "../fs/unstructured.js";
import { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { BlobServiceClient } from "@azure/storage-blob";
import * as fs from "node:fs";
import * as path$1 from "node:path";
import * as os$1 from "node:os";

//#region src/document_loaders/web/azure_blob_storage_file.ts
var azure_blob_storage_file_exports = /* @__PURE__ */ __exportAll({ AzureBlobStorageFileLoader: () => AzureBlobStorageFileLoader });
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
var AzureBlobStorageFileLoader = class extends BaseDocumentLoader {
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
		const tempDir = fs.mkdtempSync(path$1.join(os$1.tmpdir(), "azureblobfileloader-"));
		const filePath = path$1.join(tempDir, this.blobName);
		try {
			const blobClient = BlobServiceClient.fromConnectionString(this.connectionString, { userAgentOptions: { userAgentPrefix: "langchainjs-blob-storage-file" } }).getContainerClient(this.container).getBlobClient(this.blobName);
			fs.mkdirSync(path$1.dirname(filePath), { recursive: true });
			await blobClient.downloadToFile(filePath);
		} catch (e) {
			throw new Error(`Failed to download file ${this.blobName} from Azure Blob Storage container ${this.container}: ${e.message}`);
		}
		try {
			return await new UnstructuredLoader(filePath, this.unstructuredConfig).load();
		} catch {
			throw new Error(`Failed to load file ${filePath} using unstructured loader.`);
		} finally {
			fs.rmSync(path$1.dirname(filePath), {
				recursive: true,
				force: true
			});
		}
	}
};

//#endregion
export { AzureBlobStorageFileLoader, azure_blob_storage_file_exports };
//# sourceMappingURL=azure_blob_storage_file.js.map