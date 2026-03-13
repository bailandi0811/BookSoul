const require_runtime = require('../../_virtual/_rolldown/runtime.cjs');
const require_common = require('./common.cjs');
let crypto_js_sha256_js = require("crypto-js/sha256.js");
crypto_js_sha256_js = require_runtime.__toESM(crypto_js_sha256_js);
let crypto_js_hmac_sha256_js = require("crypto-js/hmac-sha256.js");
crypto_js_hmac_sha256_js = require_runtime.__toESM(crypto_js_hmac_sha256_js);

//#region src/utils/tencent_hunyuan/web.ts
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
	const canonicalRequest = `POST\n/\n\ncontent-type:${headers["Content-Type"]}\nhost:${host}\n\n${require_common.signedHeaders}\n${(0, crypto_js_sha256_js.default)(JSON.stringify(payload))}`;
	const date = require_common.getDate(timestamp);
	return `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${require_common.service}/tc3_request, SignedHeaders=${require_common.signedHeaders}, Signature=${(0, crypto_js_hmac_sha256_js.default)(`TC3-HMAC-SHA256\n${timestamp}\n${date}/${require_common.service}/tc3_request\n${(0, crypto_js_sha256_js.default)(canonicalRequest).toString()}`, (0, crypto_js_hmac_sha256_js.default)("tc3_request", (0, crypto_js_hmac_sha256_js.default)(require_common.service, (0, crypto_js_hmac_sha256_js.default)(date, `TC3${secretKey}`)))).toString()}`;
};

//#endregion
exports.sign = sign;
//# sourceMappingURL=web.cjs.map