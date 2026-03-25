//#region ../../../node_modules/.pnpm/@azure+core-auth@1.10.1/node_modules/@azure/core-auth/dist/esm/tracing.d.ts
/**
 * An interface structurally compatible with OpenTelemetry.
 */
interface TracingContext {
  /**
   * Get a value from the context.
   *
   * @param key - key which identifies a context value
   */
  getValue(key: symbol): unknown;
  /**
   * Create a new context which inherits from this context and has
   * the given key set to the given value.
   *
   * @param key - context key for which to set the value
   * @param value - value to set for the given key
   */
  setValue(key: symbol, value: unknown): TracingContext;
  /**
   * Return a new context which inherits from this context but does
   * not contain a value for the given key.
   *
   * @param key - context key for which to clear a value
   */
  deleteValue(key: symbol): TracingContext;
}
//#endregion
export { TracingContext };
//# sourceMappingURL=tracing.d.cts.map