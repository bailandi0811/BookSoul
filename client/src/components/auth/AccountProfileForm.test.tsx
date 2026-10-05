import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountProfileForm } from "./AccountProfileForm";
import { AccountSection } from "./AccountSection";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserProfileStore } from "@/store/useUserProfileStore";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const user = { id: "form-fixture", name: "Reader", email: "reader@example.invalid", emailVerifiedAt: null };
const profile = { user, revision: 0, avatar: null, wallpapers: [], wallpaper: { mode: "RANDOM" }, mediaUploadsAvailable: false, mediaReadError: null };
let root: Root, container: HTMLDivElement;
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
beforeEach(async () => {
  useAuthStore.getState().signIn({ user, accessToken: "fixture" });
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(profile));
  await useUserProfileStore.getState().loadProfile();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<><AccountSection /><AccountProfileForm /></>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); useAuthStore.getState().clearAuthentication(); vi.restoreAllMocks(); });
async function input(value: string) {
  const field = container.querySelector<HTMLInputElement>('input[aria-label="名称"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(label: string) { await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()); }
it("initializes the name, cancels edits, trims a save and updates the account entry", async () => {
  expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("Reader");
  await input("Draft"); await click("取消名称修改");
  expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("Reader");
  await input("  New name  ");
  vi.mocked(fetch).mockImplementation(async () => response({ ...profile, revision: 1, user: { ...user, name: "New name" } }));
  await click("保存名称");
  expect(container.querySelector(".account-name")?.textContent).toBe("New name");
  await act(async () => useAuthStore.getState().restoreSession({ user, accessToken: "refresh" }));
  expect(container.querySelector(".account-name")?.textContent).toBe("New name");
});
it("rejects empty, control characters and more than 50 Unicode code points", async () => {
  const requests = vi.mocked(fetch).mock.calls.length;
  for (const name of [" ", "a\u0001b", "好".repeat(51)]) { await input(name); await click("保存名称"); expect(container.querySelector('[role="alert"]')).not.toBeNull(); }
  expect(fetch).toHaveBeenCalledTimes(requests);
});
it("preserves a failed draft, prevents duplicate saves and supports explicit retry after conflict", async () => {
  await input("Draft");
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const requests = vi.mocked(fetch).mock.calls.length;
  await click("保存名称"); await click("保存名称");
  expect(fetch).toHaveBeenCalledTimes(requests + 1);
  await act(async () => finish(new Response(JSON.stringify({ code: "PROFILE_REVISION_CONFLICT", message: "Conflict" }), { status: 409 })));
  expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("Draft");
  expect(container.querySelector(".account-name")?.textContent).toBe("Reader");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("再次保存");
  vi.mocked(fetch).mockImplementation(async () => response({ ...profile, revision: 2, user: { ...user, name: "Draft" } }));
  await click("保存名称");
  expect(container.querySelector(".account-name")?.textContent).toBe("Draft");
});

it("restores the default avatar from a successful server snapshot", async () => {
  const avatar = { id: "avatar", url: null, expiresAt: null, width: 512, height: 512 };
  vi.mocked(fetch).mockImplementation(async () => response({ ...profile, revision: 1, avatar, mediaReadError: "MEDIA_STORAGE_UNAVAILABLE" }));
  await act(async () => useUserProfileStore.getState().loadProfile());
  expect(container.querySelector('[aria-label="重试头像"]')).not.toBeNull();
  vi.mocked(fetch).mockImplementation(async () => response({ ...profile, revision: 2 }));
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("恢复默认头像"))!.click());
  expect(useUserProfileStore.getState().profile?.avatar).toBeNull();
  expect(container.querySelector('[aria-label="重试头像"]')).toBeNull();
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body).toBe(JSON.stringify({ resetAvatar: true, expectedRevision: 1 }));
});
