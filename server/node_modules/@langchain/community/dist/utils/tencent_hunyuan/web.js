import { getDate, service, signedHeaders } from "./common.js";
import sha256 from "crypto-js/sha256.js";
import hmacSha256 from "crypto-js/hmac-sha256.js";

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
	const canonicalRequest = `POST\n/\n\ncontent-type:${headers["Content-Type"]}\nhost:${host}\n\n${signedHeaders}\n${sha256(JSON.stringify(payload))}`;
	const date = getDate(timestamp);
	return `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request, SignedHeaders=${signedHeaders}, Signature=${hmacSha256(`TC3-HMAC-SHA256\n${timestamp}\n${date}/${service}/tc3_request\n${sha256(canonicalRequest).toString()}`, hmacSha256("tc3_request", hmacSha256(service, hmacSha256(date, `TC3${secretKey}`)))).toString()}`;
};

//#endregion
export { sign };
//# sourceMappingURL=web.js.map