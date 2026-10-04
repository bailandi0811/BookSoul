import type { BooksView } from "@/store/useBooksStore";

export type AppScreen =
  | "landing"
  | "loading"
  | "auth"
  | "reset-password"
  | "account"
  | BooksView;

interface AppFlowState {
  authReady: boolean;
  isAuthenticated: boolean;
  view: BooksView;
  hasEnteredApp?: boolean;
  isResetRoute?: boolean;
  isAccountRoute?: boolean;
}

export function resolveAppScreen({
  authReady,
  isAuthenticated,
  view,
  hasEnteredApp = true,
  isResetRoute,
  isAccountRoute,
}: AppFlowState): AppScreen {
  if (isResetRoute) return "reset-password";
  if (!isAccountRoute && !hasEnteredApp) return "landing";
  if (!authReady) return "loading";
  if (!isAuthenticated) return "auth";
  if (isAccountRoute) return "account";
  return view;
}
