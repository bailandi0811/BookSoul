import { describe, expect, it } from "vitest";
import { readResetRoute } from "./reset-password-route";
import { resolveAppScreen } from "./app-flow";
describe("password reset entry", () => {
  it("prioritizes reset even before session restoration and recognizes malformed links", () => {
    expect(
      resolveAppScreen({
        authReady: false,
        isAuthenticated: true,
        view: "library",
        isResetRoute: true,
      }),
    ).toBe("reset-password");
    expect(readResetRoute("#reset-password")).toEqual({
      isResetRoute: true,
      token: null,
    });
    const token = Buffer.alloc(32, 1).toString("base64url");
    expect(readResetRoute("#reset-password?token=" + token)).toEqual({
      isResetRoute: true,
      token,
    });
    expect(readResetRoute("#reset-password?token=123")).toEqual({
      isResetRoute: true,
      token: null,
    });
    expect(
      readResetRoute("#reset-password?token=" + token + "&token=" + token)
        .token,
    ).toBeNull();
    expect(readResetRoute("#elsewhere").isResetRoute).toBe(false);
  });
});
