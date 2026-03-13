Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_base = require('./base.cjs');
let node_path = require("node:path");
let node_fs_promises = require("node:fs/promises");
node_fs_promises = require_runtime.__toESM(node_fs_promises);
let node_fs = require("node:fs");

//#region src/stores/file/node.ts
var node_exports = /* @__PURE__ */ require_runtime.__exportAll({ NodeFileStore: () => NodeFileStore });
/**
* Specific implementation of the `BaseFileStore` class for Node.js.
* Provides methods to read and write files in a specific base path.
*/
var NodeFileStore = class extends require_base.BaseFileStore {
	lc_namespace = [
		"langchain",
		"stores",
		"file",
		"node"
	];
	constructor(basePath = (0, node_fs.mkdtempSync)("langchain-")) {
		super();
		this.basePath = basePath;
	}
	/**
	* Reads the contents of a file at the given path.
	* @param path Path of the file to read.
	* @returns The contents of the file as a string.
	*/
	async readFile(path) {
		return await node_fs_promises.readFile((0, node_path.join)(this.basePath, path), "utf8");
	}
	/**
	* Writes the given contents to a file at the specified path.
	* @param path Path of the file to write to.
	* @param contents Contents to write to the file.
	* @returns Promise that resolves when the file has been written.
	*/
	async writeFile(path, contents) {
		await node_fs_promises.writeFile((0, node_path.join)(this.basePath, path), contents, "utf8");
	}
};

//#endregion
exports.NodeFileStore = NodeFileStore;
Object.defineProperty(exports, 'node_exports', {
  enumerable: true,
  get: function () {
    return node_exports;
  }
});
//# sourceMappingURL=node.cjs.map