import { __exportAll } from "../../_virtual/_rolldown/runtime.js";
import { sign } from "../../utils/tencent_hunyuan/index.js";
import { TencentHunyuanEmbeddings as TencentHunyuanEmbeddings$1 } from "./base.js";

//#region src/embeddings/tencent_hunyuan/index.ts
var tencent_hunyuan_exports = /* @__PURE__ */ __exportAll({ TencentHunyuanEmbeddings: () => TencentHunyuanEmbeddings });
/**
* Class for generating embeddings using the Tencent Hunyuan API.
*/
var TencentHunyuanEmbeddings = class extends TencentHunyuanEmbeddings$1 {
	constructor(fields) {
		super({
			...fields,
			sign
		});
	}
};

//#endregion
export { TencentHunyuanEmbeddings, tencent_hunyuan_exports };
//# sourceMappingURL=index.js.map