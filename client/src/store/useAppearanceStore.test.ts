import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

it("starts randomly without repeating, then restores an explicitly fixed guest image", async () => {
  localStorage.setItem("booksoul_background", "city");
  localStorage.setItem("booksoul_theme", "dark");
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.resetModules();
  const first = await import("./useAppearanceStore");
  const selected = first.useAppearanceStore.getState().background;
  expect(selected).not.toBe("city");
  expect(selected).not.toBe("none");
  expect(first.useAppearanceStore.getState().theme).toBe("dark");

  first.useAppearanceStore.getState().setBackground("city");
  expect(first.useAppearanceStore.getState().background).toBe("city");
  first.useAppearanceStore.getState().setTheme("light");
  expect(first.useAppearanceStore.getState().background).toBe("city");
  vi.resetModules();
  const reentered = await import("./useAppearanceStore");
  expect(reentered.useAppearanceStore.getState().background).toBe("city");
  expect(reentered.useAppearanceStore.getState().theme).toBe("light");
});

it("switches from fixed to random without repeating the displayed image", async () => {
  const { useAppearanceStore } = await import("./useAppearanceStore");
  useAppearanceStore.getState().prepareProfile("user:fixture:generation:1");
  const profile = { user: { id: "fixture", name: "Reader", email: "reader@example.invalid", emailVerifiedAt: null }, revision: 0, avatar: null, wallpapers: [], mediaUploadsAvailable: false, mediaReadError: null, wallpaper: { mode: "FIXED" as const, kind: "SYSTEM" as const, id: "mountains" } };
  useAppearanceStore.getState().applyProfile(profile);
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  useAppearanceStore.getState().applyProfile({ ...profile, revision: 1, wallpaper: { mode: "RANDOM" } });
  expect(useAppearanceStore.getState().selection?.id).not.toBe("mountains");
  expect(random).toHaveBeenCalledOnce();
  useAppearanceStore.getState().applyProfile({ ...profile, revision: 1, wallpaper: { mode: "RANDOM" } });
  expect(random).toHaveBeenCalledOnce();
});

it("can start without local storage and still chooses a usable wallpaper", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Storage denied", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage denied", "SecurityError");
  });
  vi.resetModules();
  const { BACKGROUNDS, useAppearanceStore } =
    await import("./useAppearanceStore");
  expect(
    BACKGROUNDS.find(
      (item) => item.id === useAppearanceStore.getState().background,
    )?.image,
  ).toBeTruthy();
  useAppearanceStore.getState().setBackground("none");
  expect(useAppearanceStore.getState().background).toBe("none");
});
