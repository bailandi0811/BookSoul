Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../_virtual/_rolldown/runtime.cjs');

//#region src/schema/query_constructor.ts
var query_constructor_exports = /* @__PURE__ */ require_runtime.__exportAll({ AttributeInfo: () => AttributeInfo });
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
exports.AttributeInfo = AttributeInfo;
Object.defineProperty(exports, 'query_constructor_exports', {
  enumerable: true,
  get: function () {
    return query_constructor_exports;
  }
});
//# sourceMappingURL=query_constructor.cjs.map