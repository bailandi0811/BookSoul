import type { BooksView } from "@/store/useBooksStore";

export type AppScreen =
  | "landing"
  | "loading"
  | "auth"
  | "reset-password"
  | "account"
  | "community"
  | "tarot"
  | BooksView;

interface AppFlowState {
  authReady: boolean;
  isAuthenticated: boolean;
  view: BooksView;
  hasEnteredApp?: boolean;
  isResetRoute?: boolean;
  isAccountRoute?: boolean;
  isCommunityRoute?: boolean;
  isTarotRoute?: boolean;
}

export function resolveAppScreen({
  authReady,
  isAuthenticated,
  view,
  hasEnteredApp = true,
  isResetRoute,
  isAccountRoute,
  isCommunityRoute,
  isTarotRoute,
}: AppFlowState): AppScreen {
  if (isResetRoute) return "reset-password";
  if (!isAccountRoute && !isCommunityRoute && !isTarotRoute && !hasEnteredApp) return "landing";
  if (!authReady) return "loading";
  if (!isAuthenticated) return "auth";
  if (isAccountRoute) return "account";
  if (isCommunityRoute) return "community";
  if (isTarotRoute) return "tarot";
  return view;
}
