//#region ../../../node_modules/.pnpm/@smithy+types@4.13.0/node_modules/@smithy/types/dist-types/util.d.ts
/**
 * @public
 *
 * A function that, when invoked, returns a promise that will be fulfilled with
 * a value of type T.
 *
 * @example A function that reads credentials from shared SDK configuration
 * files, assuming roles and collecting MFA tokens as necessary.
 */
interface Provider<T> {
  (): Promise<T>;
}
//#endregion
export { Provider };
//# sourceMappingURL=util.d.ts.map