import { useMemoryStore } from "@/store/useMemoryStore";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { restoreAuthentication } from "@/lib/auth-api";
import { useAuthStore } from "@/store/useAuthStore";
import { AuthPage } from "@/components/auth/AuthPage";
import { resolveAppScreen } from "@/lib/app-flow";
import { useBooksStore } from "@/store/useBooksStore";
import { readResetRoute } from "@/lib/reset-password-route";
import { ResetPasswordPage } from "@/components/auth/ResetPasswordPage";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "framer-motion";
import { peekCoverFlight } from "@/lib/book-cover-flight";
import { screenShift } from "@/lib/screen-transition";
import { AppScreenStage } from "@/components/AppScreenStage";
import { loadBookChat, loadBookOverview, loadBookReader } from "@/lib/book-page-loaders";
import { useUserProfileSync } from "@/components/auth/useUserProfileSync";
import { BookCoverFlightHost } from "@/components/BookCoverFlight";
import { CommunityChatHost } from "@/components/CommunityChat/CommunityChatHost";

const CommunityChatPage = lazy(() => import("@/components/CommunityChat/CommunityChatPage").then(module => ({ default: module.CommunityChatPage })));

const BookChat = lazy(loadBookChat);
const BookOverview = lazy(loadBookOverview);
const BookReader = lazy(loadBookReader);
const AccountPage = lazy(() =>
  import("@/components/auth/AccountPage").then((module) => ({ default: module.AccountPage })),
);
const Entrance = lazy(() =>
  import("@/components/Entrance").then((module) => ({
    default: module.Entrance,
  })),
);
const LandingPage = lazy(() =>
  import("@/components/LandingPage").then((module) => ({
    default: module.LandingPage,
  })),
);

function App() {
  const view = useBooksStore((s) => s.view);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const [accountRoute, setAccountRoute] = useState(() => window.location.hash === "#account");
  const [communityRoute, setCommunityRoute] = useState(() => window.location.hash === "#community");
  const [authReady, setAuthReady] = useState(false);
  const [restorationFailed, setRestorationFailed] = useState(false);
  const [restorationAttempt, setRestorationAttempt] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [resetRoute, setResetRoute] = useState(() => ({
    ...readResetRoute(window.location.hash),
    entry: 0,
  }));
  const restoration = useRef<AbortController | null>(null);
  useUserProfileSync(authReady && !resetRoute.isResetRoute && !showLogin);
  const screen = resolveAppScreen({
    authReady,
    isAuthenticated: isAuthenticated && !showLogin,
    view,
    hasEnteredApp,
    isResetRoute: resetRoute.isResetRoute,
    isAccountRoute: accountRoute,
    isCommunityRoute: communityRoute,
  });
  const reducedMotion = useReducedMotion() === true;
  const [trackedScreen, setTrackedScreen] = useState(screen);
  const [shift, setShift] = useState(() => screenShift(screen, screen, reducedMotion));
  if (screen !== trackedScreen) {
    setTrackedScreen(screen);
    setShift(screenShift(trackedScreen, screen, reducedMotion, peekCoverFlight() !== null));
  }
  const backToHomepage = () => {
    useBooksStore.getState().backToLibrary();
    setAccountRoute(false);
    setCommunityRoute(false);
    setShowLogin(false);
    setHasEnteredApp(false);
    if (window.location.hash === "#account" || window.location.hash === "#community")
      history.replaceState(history.state, "", window.location.pathname + window.location.search);
  };

  useEffect(() => {
    const captureResetLink = () => {
      setAccountRoute(window.location.hash === "#account");
      setCommunityRoute(window.location.hash === "#community");
      const route = readResetRoute(window.location.hash);
      if (!route.isResetRoute) return;
      restoration.current?.abort();
      useAuthStore.getState().invalidatePendingAuthentication();
      history.replaceState(
        history.state,
        "",
        window.location.pathname + window.location.search,
      );
      setResetRoute((previous) => ({ ...route, entry: previous.entry + 1 }));
    };
    window.addEventListener("hashchange", captureResetLink);
    return () => window.removeEventListener("hashchange", captureResetLink);
  }, []);

  useEffect(() => {
    if (!resetRoute.isResetRoute) return;
    restoration.current?.abort();
    useAuthStore.getState().invalidatePendingAuthentication();
    if (readResetRoute(window.location.hash).isResetRoute)
      history.replaceState(
        history.state,
        "",
        window.location.pathname + window.location.search,
      );
  }, [resetRoute.isResetRoute]);

  useEffect(() => {
    const clearPrivateCaches = () => {
      useBooksStore.getState().clearPrivateState();
      useMemoryStore.setState({
        profile: null,
        memories: [],
        selectedMemory: null,
        isExpanded: false,
      });
    };
    window.addEventListener("booksoul:auth-invalidated", clearPrivateCaches);
    return () =>
      window.removeEventListener(
        "booksoul:auth-invalidated",
        clearPrivateCaches,
      );
  }, []);

  useEffect(() => {
    if (resetRoute.isResetRoute || showLogin) return;
    let active = true;
    const controller = new AbortController();
    restoration.current = controller;
    void restoreAuthentication({ signal: controller.signal }).then((status) => {
      if (!active || controller.signal.aborted) return;
      if (status === "authenticated" || status === "guest") setAuthReady(true);
      else setRestorationFailed(true);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [resetRoute.isResetRoute, showLogin, restorationAttempt]);

  if (screen === "reset-password")
    return (
      <ResetPasswordPage
        key={resetRoute.entry}
        token={resetRoute.token}
        onComplete={() => {
          setResetRoute((current) => ({ ...current, token: null }));
          setAuthReady(true);
        }}
        onExit={() => {
          setShowLogin(true);
          setHasEnteredApp(true);
          setAuthReady(true);
          setResetRoute((current) => ({
            ...current,
            isResetRoute: false,
            token: null,
          }));
        }}
      />
    );

  if (screen === "loading") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background text-sm text-muted-foreground">
        {restorationFailed ? (
          <div role="alert" className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
            <h1 className="text-lg font-medium text-foreground">暂时无法恢复会话</h1>
            <p>服务连接超时或暂不可用，请稍后重试。</p>
            <Button onClick={() => {
              setRestorationFailed(false);
              setRestorationAttempt((attempt) => attempt + 1);
            }}>重试</Button>
          </div>
        ) : "正在恢复会话…"}
      </div>
    );
  }

  if (screen === "auth") {
    return (
      <AuthPage
        onBackHome={backToHomepage}
        onAuthenticated={() => {
          setShowLogin(false);
          setHasEnteredApp(true);
          setAccountRoute(false);
          if (window.location.hash === "#account") history.replaceState(history.state, "", window.location.pathname + window.location.search);
          useBooksStore.getState().backToLibrary();
        }}
      />
    );
  }

  return (
    <>
      <AppScreenStage screenKey={screen} shift={shift}>
        <Suspense
          fallback={
            <div className="app-screen-fallback grid place-items-center bg-background text-sm text-muted-foreground">
              正在翻开书页…
            </div>
          }
        >
          {screen === "landing" ? (
            <LandingPage onEnter={() => setHasEnteredApp(true)} />
          ) : screen === "community" ? (
            <CommunityChatPage onBack={() => {
              useBooksStore.getState().backToLibrary();
              setHasEnteredApp(true);
              setCommunityRoute(false);
              history.replaceState(history.state, "", window.location.pathname + window.location.search);
            }} />
          ) : screen === "account" ? (
            <AccountPage key={userId} onBack={() => {
              useBooksStore.getState().backToLibrary();
              setAccountRoute(false);
              history.replaceState(history.state, "", window.location.pathname + window.location.search);
            }} />
          ) : screen === "library" ? <Entrance onBackHome={backToHomepage} /> : screen === "book" ? <BookOverview /> : screen === "reader" ? <BookReader /> : <BookChat />}
        </Suspense>
      </AppScreenStage>
      {screen !== "landing" && <CommunityChatHost />}
      <BookCoverFlightHost />
    </>
  );
}

export default App;
