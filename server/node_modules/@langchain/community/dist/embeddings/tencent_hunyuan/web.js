import { __exportAll } from "../../_virtual/_rolldown/runtime.js";
import { sign } from "../../utils/tencent_hunyuan/web.js";
import { TencentHunyuanEmbeddings as TencentHunyuanEmbeddings$1 } from "./base.js";

//#region src/embeddings/tencent_hunyuan/web.ts
var web_exports = /* @__PURE__ */ __exportAll({ TencentHunyuanEmbeddings: () => TencentHunyuanEmbeddings });
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
export { TencentHunyuanEmbeddings, web_exports };
//# sourceMappingURL=web.js.map