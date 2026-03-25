Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region src/util/document.ts
var document_exports = /* @__PURE__ */ require("../_virtual/_rolldown/runtime.cjs").__exportAll({ formatDocumentsAsString: () => formatDocumentsAsString });
/**
* Given a list of documents, this util formats their contents
* into a string, separated by newlines.
*
* @param documents
* @returns A string of the documents page content, separated by newlines.
*/
const formatDocumentsAsString = (documents) => documents.map((doc) => doc.pageContent).join("\n\n");
//#endregion
Object.defineProperty(exports, "document_exports", {
	enumerable: true,
	get: function() {
		return document_exports;
	}
});
exports.formatDocumentsAsString = formatDocumentsAsString;

//# sourceMappingURL=document.cjs.map