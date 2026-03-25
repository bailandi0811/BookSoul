import { AbortSignalLike } from "../../../../../../@azure_abort-controller@2.1.2/node_modules/@azure/abort-controller/dist/esm/AbortSignalLike.js";
import { HttpMethods } from "../../../../../../@azure_core-util@1.13.1/node_modules/@azure/core-util/dist/esm/index.js";
import { TracingContext } from "./tracing.js";

//#region ../../../node_modules/.pnpm/@azure+core-auth@1.10.1/node_modules/@azure/core-auth/dist/esm/tokenCredential.d.ts
/**
 * Represents a credential capable of providing an authentication token.
 */
interface TokenCredential {
  /**
   * Gets the token provided by this credential.
   *
   * This method is called automatically by Azure SDK client libraries. You may call this method
   * directly, but you must also handle token caching and token refreshing.
   *
   * @param scopes - The list of scopes for which the token will have access.
   * @param options - The options used to configure any requests this
   *                TokenCredential implementation might make.
   */
  getToken(scopes: string | string[], options?: GetTokenOptions): Promise<AccessToken | null>;
}
/**
 * Defines options for TokenCredential.getToken.
 */
interface GetTokenOptions {
  /**
   * The signal which can be used to abort requests.
   */
  abortSignal?: AbortSignalLike;
  /**
   * Options used when creating and sending HTTP requests for this operation.
   */
  requestOptions?: {
    /**
     * The number of milliseconds a request can take before automatically being terminated.
     */
    timeout?: number;
  };
  /**
   * Options used when tracing is enabled.
   */
  tracingOptions?: {
    /**
     * Tracing Context for the current request.
     */
    tracingContext?: TracingContext;
  };
  /**
   * Claim details to perform the Continuous Access Evaluation authentication flow
   */
  claims?: string;
  /**
   * Indicates whether to enable the Continuous Access Evaluation authentication flow
   */
  enableCae?: boolean;
  /**
   * Allows specifying a tenantId. Useful to handle challenges that provide tenant Id hints.
   */
  tenantId?: string;
  /**
   * Options for Proof of Possession token requests
   */
  proofOfPossessionOptions?: {
    /**
     * The nonce value required for PoP token requests.
     * This is typically retrieved from the WWW-Authenticate header of a 401 challenge response.
     * This is used in combination with {@link resourceRequestUrl} and {@link resourceRequestMethod} to generate the PoP token.
     */
    nonce: string;
    /**
     * The HTTP method of the request.
     * This is used in combination with {@link resourceRequestUrl} and {@link nonce} to generate the PoP token.
     */
    resourceRequestMethod: HttpMethods;
    /**
     * The URL of the request.
     * This is used in combination with {@link resourceRequestMethod} and {@link nonce} to generate the PoP token.
     */
    resourceRequestUrl: string;
  };
}
/**
 * Represents an access token with an expiration time.
 */
interface AccessToken {
  /**
   * The access token returned by the authentication service.
   */
  token: string;
  /**
   * The access token's expiration timestamp in milliseconds, UNIX epoch time.
   */
  expiresOnTimestamp: number;
  /**
   * The timestamp when the access token should be refreshed, in milliseconds, UNIX epoch time.
   */
  refreshAfterTimestamp?: number;
  /** Type of token - `Bearer` or `pop` */
  tokenType?: "Bearer" | "pop";
}
//#endregion
export { AccessToken, GetTokenOptions, TokenCredential };
//# sourceMappingURL=tokenCredential.d.ts.map