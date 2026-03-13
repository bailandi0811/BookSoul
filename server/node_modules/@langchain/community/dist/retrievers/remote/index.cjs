Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_base = require('./base.cjs');

//#region src/retrievers/remote/index.ts
var remote_exports = /* @__PURE__ */ require_runtime.__exportAll({ RemoteRetriever: () => require_base.RemoteRetriever });

//#endregion
exports.RemoteRetriever = require_base.RemoteRetriever;
Object.defineProperty(exports, 'remote_exports', {
  enumerable: true,
  get: function () {
    return remote_exports;
  }
});
//# sourceMappingURL=index.cjs.map