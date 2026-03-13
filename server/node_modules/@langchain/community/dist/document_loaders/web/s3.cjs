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
let node_stream = require("node:stream");
let _aws_sdk_client_s3 = require("@aws-sdk/client-s3");

//#region src/document_loaders/web/s3.ts
var s3_exports = /* @__PURE__ */ require_runtime.__exportAll({ S3Loader: () => S3Loader });
/**
* A class that extends the BaseDocumentLoader class. It represents a
* document loader for loading files from an S3 bucket.
* @example
* ```typescript
* const loader = new S3Loader({
*   bucket: "my-document-bucket-123",
*   key: "AccountingOverview.pdf",
*   s3Config: {
*     region: "us-east-1",
*     credentials: {
*       accessKeyId: "<YourAccessKeyId>",
*       secretAccessKey: "<YourSecretAccessKey>",
*     },
*   },
*   unstructuredAPIURL: "<YourUnstructuredAPIURL>",
*   unstructuredAPIKey: "<YourUnstructuredAPIKey>",
* });
* const docs = await loader.load();
* ```
*/
var S3Loader = class extends _langchain_core_document_loaders_base.BaseDocumentLoader {
	bucket;
	key;
	unstructuredAPIURL;
	unstructuredAPIKey;
	s3Config;
	_fs;
	_UnstructuredLoader;
	constructor({ bucket, key, unstructuredAPIURL, unstructuredAPIKey, s3Config = {}, fs = node_fs, UnstructuredLoader: UnstructuredLoader$1 = require_document_loaders_fs_unstructured.UnstructuredLoader }) {
		super();
		this.bucket = bucket;
		this.key = key;
		this.unstructuredAPIURL = unstructuredAPIURL;
		this.unstructuredAPIKey = unstructuredAPIKey;
		this.s3Config = s3Config;
		this._fs = fs;
		this._UnstructuredLoader = UnstructuredLoader$1;
	}
	/**
	* Loads the file from the S3 bucket, saves it to a temporary directory,
	* and then uses the UnstructuredLoader to load the file as a document.
	* @returns An array of Document objects representing the loaded documents.
	*/
	async load() {
		const tempDir = this._fs.mkdtempSync(node_path.join(node_os.tmpdir(), "s3fileloader-"));
		const filePath = node_path.join(tempDir, this.key);
		try {
			const s3Client = new _aws_sdk_client_s3.S3Client(this.s3Config);
			const getObjectCommand = new _aws_sdk_client_s3.GetObjectCommand({
				Bucket: this.bucket,
				Key: this.key
			});
			const response = await s3Client.send(getObjectCommand);
			const objectData = await new Promise((resolve, reject) => {
				const chunks = [];
				if (response.Body instanceof node_stream.Readable) {
					response.Body.on("data", (chunk) => chunks.push(chunk));
					response.Body.on("end", () => resolve(Buffer.concat(chunks)));
					response.Body.on("error", reject);
				} else reject(/* @__PURE__ */ new Error("Response body is not a readable stream."));
			});
			this._fs.mkdirSync(node_path.dirname(filePath), { recursive: true });
			this._fs.writeFileSync(filePath, objectData);
		} catch (e) {
			throw new Error(`Failed to download file ${this.key} from S3 bucket ${this.bucket}: ${e.message}`);
		}
		try {
			const options = {
				apiUrl: this.unstructuredAPIURL,
				apiKey: this.unstructuredAPIKey
			};
			return await new this._UnstructuredLoader(filePath, options).load();
		} catch {
			throw new Error(`Failed to load file ${filePath} using unstructured loader.`);
		}
	}
};

//#endregion
exports.S3Loader = S3Loader;
Object.defineProperty(exports, 's3_exports', {
  enumerable: true,
  get: function () {
    return s3_exports;
  }
});
//# sourceMappingURL=s3.cjs.map