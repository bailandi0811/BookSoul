import type { BooksView } from "@/store/useBooksStore";

export type AppScreen =
  | "landing"
  | "loading"
  | "auth"
  | "reset-password"
  | "account"
  | "community"
  | BooksView;

interface AppFlowState {
  authReady: boolean;
  isAuthenticated: boolean;
  view: BooksView;
  hasEnteredApp?: boolean;
  isResetRoute?: boolean;
  isAccountRoute?: boolean;
  isCommunityRoute?: boolean;
}

export function resolveAppScreen({
  authReady,
  isAuthenticated,
  view,
  hasEnteredApp = true,
  isResetRoute,
  isAccountRoute,
  isCommunityRoute,
}: AppFlowState): AppScreen {
  if (isResetRoute) return "reset-password";
  if (!isAccountRoute && !isCommunityRoute && !hasEnteredApp) return "landing";
  if (!authReady) return "loading";
  if (!isAuthenticated) return "auth";
  if (isAccountRoute) return "account";
  if (isCommunityRoute) return "community";
  return view;
}
