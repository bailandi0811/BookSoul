import type { BooksView } from "@/store/useBooksStore";

export type AppScreen = "loading" | "auth" | BooksView;

interface AppFlowState {
  authReady: boolean;
  isAuthenticated: boolean;
  view: BooksView;
}

export function resolveAppScreen({
  authReady,
  isAuthenticated,
  view,
}: AppFlowState): AppScreen {
  if (!authReady) return "loading";
  if (!isAuthenticated) return "auth";
  return view;
}
