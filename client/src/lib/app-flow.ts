import type { BooksView } from "@/store/useBooksStore";

export type AppScreen =
  | "loading"
  | "auth"
  | "reset-password"
  | "account"
  | BooksView;

interface AppFlowState {
  authReady: boolean;
  isAuthenticated: boolean;
  view: BooksView;
  isResetRoute?: boolean;
  isAccountRoute?: boolean;
}

export function resolveAppScreen({
  authReady,
  isAuthenticated,
  view,
  isResetRoute,
  isAccountRoute,
}: AppFlowState): AppScreen {
  if (isResetRoute) return "reset-password";
  if (!authReady) return "loading";
  if (!isAuthenticated) return "auth";
  if (isAccountRoute) return "account";
  return view;
}
