import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  user: AuthUser;
}

export type ClaimState = "idle" | "claiming" | "partial" | "failed";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  guestUserId: string;
  claimState: ClaimState;
  claimMessage: string | null;
  isAuthenticated: boolean;
  signIn: (data: AuthTokens) => void;
  restoreSession: (data: AuthTokens) => void;
  updateTokens: (accessToken: string) => void;
  setClaimState: (state: ClaimState, message?: string | null) => void;
  completeClaim: () => void;
  clearAuthentication: () => void;
}

function createGuestUserId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (symbol) => {
          const random = Math.floor(Math.random() * 16);
          const value = symbol === "x" ? random : (random & 0x3) | 0x8;
          return value.toString(16);
        });
  return `guest_${uuid}`;
}

export function normalizeGuestUserId(value: unknown): string {
  if (
    typeof value === "string" &&
    /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return value;
  }
  return createGuestUserId();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      guestUserId: createGuestUserId(),
      claimState: "idle",
      claimMessage: null,
      isAuthenticated: false,
      signIn: ({ accessToken, user }) =>
        set({
          accessToken,
          user,
          isAuthenticated: true,
          claimState: "idle",
          claimMessage: null,
        }),
      restoreSession: ({ accessToken, user }) =>
        set({
          accessToken,
          user,
          isAuthenticated: true,
        }),
      updateTokens: (accessToken) =>
        set((state) =>
          state.user
            ? { accessToken, isAuthenticated: true }
            : {
                accessToken: null,
                isAuthenticated: false,
              },
        ),
      setClaimState: (claimState, claimMessage = null) =>
        set({ claimState, claimMessage }),
      completeClaim: () =>
        set({
          guestUserId: createGuestUserId(),
          claimState: "idle",
          claimMessage: null,
        }),
      clearAuthentication: () =>
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          claimState: "idle",
          claimMessage: null,
        }),
    }),
    {
      name: "booksoul-auth",
      version: 2,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AuthState>;
        const validUserState = Boolean(saved.user && saved.accessToken);
        return {
          ...current,
          ...saved,
          guestUserId: normalizeGuestUserId(saved.guestUserId),
          user: validUserState ? saved.user! : null,
          accessToken: validUserState ? saved.accessToken! : null,
          isAuthenticated: validUserState,
        };
      },
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        guestUserId: state.guestUserId,
        claimState: state.claimState,
        claimMessage: state.claimMessage,
      }),
    },
  ),
);

export function getIdentityUserId(): string {
  const state = useAuthStore.getState();
  return state.user?.id ?? state.guestUserId;
}
