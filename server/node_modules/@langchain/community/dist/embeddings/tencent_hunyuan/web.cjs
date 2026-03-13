Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_web = require('../../utils/tencent_hunyuan/web.cjs');
const require_base = require('./base.cjs');

//#region src/embeddings/tencent_hunyuan/web.ts
var web_exports = /* @__PURE__ */ require_runtime.__exportAll({ TencentHunyuanEmbeddings: () => TencentHunyuanEmbeddings });
/**
* Class for generating embeddings using the Tencent Hunyuan API.
*/
var TencentHunyuanEmbeddings = class extends require_base.TencentHunyuanEmbeddings {
	constructor(fields) {
		super({
			...fields,
			sign: require_web.sign
		});
	}
};

//#endregion
exports.TencentHunyuanEmbeddings = TencentHunyuanEmbeddings;
Object.defineProperty(exports, 'web_exports', {
  enumerable: true,
  get: function () {
    return web_exports;
  }
});
//# sourceMappingURL=web.cjs.map