import { describe, expect, it } from "vitest";
import { resolveAppScreen } from "./app-flow";

describe("app authentication flow", () => {
  it("opens the independent community route after authentication", () => {
    expect(resolveAppScreen({authReady:true,isAuthenticated:true,view:'library',hasEnteredApp:false,isCommunityRoute:true})).toBe('community');
    expect(resolveAppScreen({authReady:true,isAuthenticated:false,view:'library',isCommunityRoute:true})).toBe('auth');
    expect(resolveAppScreen({authReady:true,isAuthenticated:true,view:'library',isCommunityRoute:true,isResetRoute:true})).toBe('reset-password');
  });
  it("shows the public landing page before the reader chooses to enter", () => {
    expect(
      resolveAppScreen({
        authReady: false,
        isAuthenticated: false,
        view: "library",
        hasEnteredApp: false,
      }),
    ).toBe("landing");
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: true,
        view: "library",
        hasEnteredApp: false,
      }),
    ).toBe("landing");
  });

  it("chooses the authenticated flow after entering from the landing page", () => {
    expect(
      resolveAppScreen({
        authReady: false,
        isAuthenticated: false,
        view: "library",
        hasEnteredApp: true,
      }),
    ).toBe("loading");
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: false,
        view: "library",
        hasEnteredApp: true,
      }),
    ).toBe("auth");
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: true,
        view: "library",
        hasEnteredApp: true,
      }),
    ).toBe("library");
  });

  it("opens the account page only after successful authentication restoration", () => {
    expect(
      resolveAppScreen({
        authReady: false,
        isAuthenticated: true,
        view: "library",
        isAccountRoute: true,
        hasEnteredApp: false,
      }),
    ).toBe("loading");
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: false,
        view: "library",
        isAccountRoute: true,
        hasEnteredApp: false,
      }),
    ).toBe("auth");
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: true,
        view: "workspace",
        isAccountRoute: true,
        hasEnteredApp: false,
      }),
    ).toBe("account");
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: true,
        view: "library",
        isAccountRoute: true,
        isResetRoute: true,
        hasEnteredApp: false,
      }),
    ).toBe("reset-password");
  });
  it("waits for session restoration before choosing a screen", () => {
    expect(
      resolveAppScreen({
        authReady: false,
        isAuthenticated: true,
        view: "workspace",
        hasEnteredApp: true,
      }),
    ).toBe("loading");
  });

  it("always gates an unauthenticated user, even with a saved dialogue view", () => {
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: false,
        view: "workspace",
        hasEnteredApp: true,
      }),
    ).toBe("auth");
  });

  it("sends a newly authenticated user to character selection", () => {
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: true,
        view: "library",
        hasEnteredApp: true,
      }),
    ).toBe("library");
  });

  it("keeps an established authenticated dialogue open", () => {
    expect(
      resolveAppScreen({
        authReady: true,
        isAuthenticated: true,
        view: "workspace",
        hasEnteredApp: true,
      }),
    ).toBe("workspace");
  });
});
