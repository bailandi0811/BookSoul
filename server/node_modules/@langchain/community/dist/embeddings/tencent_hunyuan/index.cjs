Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_index = require('../../utils/tencent_hunyuan/index.cjs');
const require_base = require('./base.cjs');

//#region src/embeddings/tencent_hunyuan/index.ts
var tencent_hunyuan_exports = /* @__PURE__ */ require_runtime.__exportAll({ TencentHunyuanEmbeddings: () => TencentHunyuanEmbeddings });
/**
* Class for generating embeddings using the Tencent Hunyuan API.
*/
var TencentHunyuanEmbeddings = class extends require_base.TencentHunyuanEmbeddings {
	constructor(fields) {
		super({
			...fields,
			sign: require_index.sign
		});
	}
};

//#endregion
exports.TencentHunyuanEmbeddings = TencentHunyuanEmbeddings;
Object.defineProperty(exports, 'tencent_hunyuan_exports', {
  enumerable: true,
  get: function () {
    return tencent_hunyuan_exports;
  }
});
//# sourceMappingURL=index.cjs.map