Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_indexing = require("@langchain/core/indexing");

//#region src/indexes/index.ts
var indexes_exports = /* @__PURE__ */ require_runtime.__exportAll({
	_HashedDocument: () => _langchain_core_indexing._HashedDocument,
	_batch: () => _langchain_core_indexing._batch,
	_deduplicateInOrder: () => _langchain_core_indexing._deduplicateInOrder,
	_getSourceIdAssigner: () => _langchain_core_indexing._getSourceIdAssigner,
	_isBaseDocumentLoader: () => _langchain_core_indexing._isBaseDocumentLoader,
	index: () => _langchain_core_indexing.index
});

//#endregion
exports._HashedDocument = _langchain_core_indexing._HashedDocument;
exports._batch = _langchain_core_indexing._batch;
exports._deduplicateInOrder = _langchain_core_indexing._deduplicateInOrder;
exports._getSourceIdAssigner = _langchain_core_indexing._getSourceIdAssigner;
exports._isBaseDocumentLoader = _langchain_core_indexing._isBaseDocumentLoader;
exports.index = _langchain_core_indexing.index;
Object.defineProperty(exports, 'indexes_exports', {
  enumerable: true,
  get: function () {
    return indexes_exports;
  }
});
//# sourceMappingURL=index.cjs.map