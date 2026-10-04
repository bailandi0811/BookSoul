export const loadBookOverview = () => import("@/components/BookOverview");
export const loadBookReader = () => import("@/components/BookReader");
export const loadBookChat = () => import("@/components/BookChat");
// Speculative imports warm the module cache; a navigation still reports a load error normally.
export const preloadOverview = () => { void loadBookOverview().catch(() => {}); };
export const preloadReader = () => { void loadBookReader().catch(() => {}); };
export const preloadChat = () => { void loadBookChat().catch(() => {}); };
