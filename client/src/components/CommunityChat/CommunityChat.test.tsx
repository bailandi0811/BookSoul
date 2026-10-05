import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommunityComposer } from "./CommunityComposer";
import { CommunityMessageItem } from "./CommunityMessageItem";
import { useCommunityStore } from "@/store/useCommunityStore";
import type { CommunityMessage } from "@/lib/community-types";
import * as api from "@/lib/community-api";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useCommunityStore.getState().clearForIdentityChange();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("does not choose stale members while a different query is pending", async () => {
  vi.useFakeTimers();
  vi.spyOn(api, "searchCommunityMembers")
    .mockResolvedValueOnce([
      { memberId: "member-old", name: "甲", avatarRevision: null },
    ])
    .mockImplementationOnce(() => new Promise(() => {}));
  useCommunityStore.setState({
    connectionStatus: "online",
    draft: "",
    membership: {
      memberId: "me",
      isModerator: false,
      mutedUntil: null,
      lastReadSeq: "0",
      unreadCount: 0,
      replyUnreadCount: 0,
      latestEventSeq: "0",
    },
  });
  const send = vi.spyOn(useCommunityStore.getState(), "send");
  act(() => root.render(<CommunityComposer />));
  const input = container.querySelector("textarea")!;
  const query = (text: string) => {
    act(() => useCommunityStore.getState().setDraft(text));
    act(() => {
      input.focus();
      input.setSelectionRange(text.length, text.length);
      input.dispatchEvent(
        new KeyboardEvent("keyup", { key: "a", bubbles: true }),
      );
    });
  };
  query("@甲");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(201);
  });
  expect(container.textContent).toContain("甲");
  expect(api.searchCommunityMembers).toHaveBeenCalledWith(
    "甲",
    expect.any(AbortSignal),
  );
  query("@乙");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(201);
  });
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(useCommunityStore.getState().draftMentions).toEqual([]);
  expect(useCommunityStore.getState().draft).toBe("@乙");
  expect(send).not.toHaveBeenCalled();
});
it("renders untrusted HTML as text", () => {
  const message: CommunityMessage = {
    id: "m",
    seq: "1",
    clientMessageId: "key",
    author: { memberId: "other", name: "Reader" },
    content: "<img src=x onerror=alert(1)>",
    status: "ACTIVE",
    createdAt: new Date(0).toISOString(),
    replyTo: null,
  };
  act(() => root.render(<CommunityMessageItem message={message} />));
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain(message.content);
});
it("does not send on Enter while composing Chinese", () => {
  useCommunityStore.setState({ connectionStatus: "online", draft: "你好" });
  const send = vi.spyOn(useCommunityStore.getState(), "send");
  act(() => root.render(<CommunityComposer />));
  const input = container.querySelector("textarea")!;
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  expect(send).not.toHaveBeenCalled();
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(send).toHaveBeenCalledOnce();
});
