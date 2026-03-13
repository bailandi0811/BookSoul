const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_common = require('./common.cjs');
let node_crypto = require("node:crypto");

//#region src/utils/tencent_hunyuan/index.ts
const sha256 = (data) => (0, node_crypto.createHash)("sha256").update(data).digest("hex");
const hmacSha256 = (data, key) => (0, node_crypto.createHmac)("sha256", key).update(data).digest();
const hmacSha256Hex = (data, key) => (0, node_crypto.createHmac)("sha256", key).update(data).digest("hex");
/**
* Method that calculate Tencent Cloud API v3 signature
* for making requests to the Tencent Cloud API.
* See https://cloud.tencent.com/document/api/1729/101843.
* @param host Tencent Cloud API host.
* @param payload HTTP request body.
* @param timestamp Sign timestamp in seconds.
* @param secretId Tencent Cloud Secret ID, which can be obtained from https://console.cloud.tencent.com/cam/capi.
* @param secretKey Tencent Cloud Secret Key, which can be obtained from https://console.cloud.tencent.com/cam/capi.
* @param headers HTTP request headers.
* @returns The signature for making requests to the Tencent API.
*/
const sign = (host, payload, timestamp, secretId, secretKey, headers) => {
	const canonicalRequest = `POST\n/\n\ncontent-type:${headers["Content-Type"]}\nhost:${host}\n\n${require_common.signedHeaders}\n${sha256(JSON.stringify(payload))}`;
	const date = require_common.getDate(timestamp);
	return `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${require_common.service}/tc3_request, SignedHeaders=${require_common.signedHeaders}, Signature=${hmacSha256Hex(`TC3-HMAC-SHA256\n${timestamp}\n${date}/${require_common.service}/tc3_request\n${sha256(canonicalRequest)}`, hmacSha256("tc3_request", hmacSha256(require_common.service, hmacSha256(date, `TC3${secretKey}`))))}`;
};

//#endregion
exports.sign = sign;
//# sourceMappingURL=index.cjs.map