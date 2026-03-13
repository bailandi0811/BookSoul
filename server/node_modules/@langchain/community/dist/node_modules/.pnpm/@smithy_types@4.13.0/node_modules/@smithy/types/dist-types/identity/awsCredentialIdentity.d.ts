import { Identity } from "./identity.js";

//#region ../../../node_modules/.pnpm/@smithy+types@4.13.0/node_modules/@smithy/types/dist-types/identity/awsCredentialIdentity.d.ts
/**
 * @public
 */
interface AwsCredentialIdentity extends Identity {
  /**
   * AWS access key ID
   */
  readonly accessKeyId: string;
  /**
   * AWS secret access key
   */
  readonly secretAccessKey: string;
  /**
   * A security or session token to use with these credentials. Usually
   * present for temporary credentials.
   */
  readonly sessionToken?: string;
  /**
   * AWS credential scope for this set of credentials.
   */
  readonly credentialScope?: string;
  /**
   * AWS accountId.
   */
  readonly accountId?: string;
}
//#endregion
export { AwsCredentialIdentity };
//# sourceMappingURL=awsCredentialIdentity.d.ts.map