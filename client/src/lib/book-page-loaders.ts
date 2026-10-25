export const loadBookOverview = () => import("@/components/BookOverview");
export const loadBookReader = () => import("@/components/BookReader");
export const loadBookChat = () => import("@/components/BookChat");

export type LazyBooksView = "book" | "reader" | "workspace";

const moduleInflight = new Map<LazyBooksView, Promise<unknown>>();

function loadBooksViewModuleOnce(view: LazyBooksView, load: () => Promise<unknown>) {
  let pending = moduleInflight.get(view);
  if (!pending) {
    pending = load().catch((error) => {
      moduleInflight.delete(view);
      throw error;
    });
    moduleInflight.set(view, pending);
  }
  return pending;
}

/** Route-level lazy chunk for a books-scoped screen; resolves immediately when already cached. */
export function loadBooksViewModule(view: LazyBooksView): Promise<unknown> {
  switch (view) {
    case "book":
      return loadBooksViewModuleOnce(view, loadBookOverview);
    case "reader":
      return loadBooksViewModuleOnce(view, loadBookReader);
    case "workspace":
      return loadBooksViewModuleOnce(view, loadBookChat);
  }
}
// Speculative imports warm the module cache; a navigation still reports a load error normally.
export const preloadOverview = () => { void loadBooksViewModule("book").catch(() => {}); };
export const preloadReader = () => { void loadBooksViewModule("reader").catch(() => {}); };
export const preloadChat = () => { void loadBooksViewModule("workspace").catch(() => {}); };

const preloadModule = (load: () => Promise<unknown>) => { void load().catch(() => {}); };

/** Warm every screen the shelf can open so the first click does not swap in a fallback. */
export function preloadLibraryDestinations() {
  preloadOverview();
  preloadReader();
  preloadChat();
  preloadModule(() => import("@/components/auth/AccountPage"));
  preloadModule(() => import("@/components/CommunityChat/CommunityChatPage"));
  preloadModule(() => import("@/components/LandingPage"));
}
