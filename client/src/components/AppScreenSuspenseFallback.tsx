/** Keeps scenic veil + paper tone while a lazy route chunk resolves (see chunk-ready navigation spec). */
export function AppScreenSuspenseFallback() {
  return (
    <div
      className="book-navigation-shell app-screen-fallback min-h-full text-foreground"
      role="status"
      aria-live="polite"
    >
      <p className="app-screen-fallback__status">正在翻开书页…</p>
    </div>
  );
}
