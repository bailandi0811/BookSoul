Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
let _langchain_classic_document_loaders_fs_text = require("@langchain/classic/document_loaders/fs/text");
let _langchain_classic_document_loaders_fs_directory = require("@langchain/classic/document_loaders/fs/directory");

//#region src/document_loaders/fs/notion.ts
var notion_exports = /* @__PURE__ */ require_runtime.__exportAll({ NotionLoader: () => NotionLoader });
/**
* A class that extends the DirectoryLoader class. It represents a
* document loader that loads documents from a directory in the Notion
* format. It uses the TextLoader for loading '.md' files and ignores
* unknown file types.
*/
var NotionLoader = class extends _langchain_classic_document_loaders_fs_directory.DirectoryLoader {
	constructor(directoryPath) {
		super(directoryPath, { ".md": (filePath) => new _langchain_classic_document_loaders_fs_text.TextLoader(filePath) }, true, _langchain_classic_document_loaders_fs_directory.UnknownHandling.Ignore);
	}
};

//#endregion
exports.NotionLoader = NotionLoader;
Object.defineProperty(exports, 'notion_exports', {
  enumerable: true,
  get: function () {
    return notion_exports;
  }
});
//# sourceMappingURL=notion.cjs.map