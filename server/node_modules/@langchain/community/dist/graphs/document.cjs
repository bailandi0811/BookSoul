Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');
let _langchain_core_load_serializable = require("@langchain/core/load/serializable");

//#region src/graphs/document.ts
var document_exports = /* @__PURE__ */ require_runtime.__exportAll({
	GraphDocument: () => GraphDocument,
	Node: () => Node,
	Relationship: () => Relationship
});
var Node = class extends _langchain_core_load_serializable.Serializable {
	id;
	type;
	properties;
	lc_namespace = [
		"langchain",
		"graph",
		"document_node"
	];
	constructor({ id, type = "Node", properties = {} }) {
		super();
		this.id = id;
		this.type = type;
		this.properties = properties;
	}
};
var Relationship = class extends _langchain_core_load_serializable.Serializable {
	source;
	target;
	type;
	properties;
	lc_namespace = [
		"langchain",
		"graph",
		"document_relationship"
	];
	constructor({ source, target, type, properties = {} }) {
		super();
		this.source = source;
		this.target = target;
		this.type = type;
		this.properties = properties;
	}
};
var GraphDocument = class extends _langchain_core_load_serializable.Serializable {
	nodes;
	relationships;
	source;
	lc_namespace = [
		"langchain",
		"graph",
		"graph_document"
	];
	constructor({ nodes, relationships, source }) {
		super({
			nodes,
			relationships,
			source
		});
		this.nodes = nodes;
		this.relationships = relationships;
		this.source = source;
	}
};

//#endregion
exports.GraphDocument = GraphDocument;
exports.Node = Node;
exports.Relationship = Relationship;
Object.defineProperty(exports, 'document_exports', {
  enumerable: true,
  get: function () {
    return document_exports;
  }
});
//# sourceMappingURL=document.cjs.map