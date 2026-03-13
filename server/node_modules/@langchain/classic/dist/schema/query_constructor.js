import { __exportAll } from "../_virtual/_rolldown/runtime.js";

//#region src/schema/query_constructor.ts
var query_constructor_exports = /* @__PURE__ */ __exportAll({ AttributeInfo: () => AttributeInfo });
/**
* A simple data structure that holds information about an attribute. It
* is typically used to provide metadata about attributes in other classes
* or data structures within the LangChain framework.
*/
var AttributeInfo = class {
	constructor(name, type, description) {
		this.name = name;
		this.type = type;
		this.description = description;
	}
};

//#endregion
export { AttributeInfo, query_constructor_exports };
//# sourceMappingURL=query_constructor.js.map