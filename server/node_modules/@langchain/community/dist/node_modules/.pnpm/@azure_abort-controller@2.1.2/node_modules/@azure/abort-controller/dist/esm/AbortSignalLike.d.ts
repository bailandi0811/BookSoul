//#region ../../../node_modules/.pnpm/@azure+abort-controller@2.1.2/node_modules/@azure/abort-controller/dist/esm/AbortSignalLike.d.ts
/**
 * Allows the request to be aborted upon firing of the "abort" event.
 * Compatible with the browser built-in AbortSignal and common polyfills.
 */
interface AbortSignalLike {
  /**
   * Indicates if the signal has already been aborted.
   */
  readonly aborted: boolean;
  /**
   * Add new "abort" event listener, only support "abort" event.
   */
  addEventListener(type: "abort", listener: (this: AbortSignalLike, ev: any) => any, options?: any): void;
  /**
   * Remove "abort" event listener, only support "abort" event.
   */
  removeEventListener(type: "abort", listener: (this: AbortSignalLike, ev: any) => any, options?: any): void;
}
//#endregion
export { AbortSignalLike };
//# sourceMappingURL=AbortSignalLike.d.ts.map