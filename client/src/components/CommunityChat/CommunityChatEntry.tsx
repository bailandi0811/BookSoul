import { MessagesSquare } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useCommunityStore } from "@/store/useCommunityStore";
export function CommunityChatEntry({ mobile = false }: { mobile?: boolean }) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const unread = useCommunityStore((s) => s.unreadCount);
  if (!authenticated) return null;
  return (
    <a
      href="#community"
      aria-label={`书友客厅${unread ? `，${unread}条未读` : ""}`}
      title="书友客厅"
      className="community-entry relative flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/80 px-2 py-2 text-xs sm:px-2.5"
      onPointerEnter={() => void import("./CommunityChatPage")}
      onFocus={() => void import("./CommunityChatPage")}
    >
      <MessagesSquare size={16} />
      <span className={mobile ? "" : "hidden sm:inline"}>书友客厅</span>
      {unread > 0 && (
        <span className="community-unread-badge absolute -right-1 -top-1 rounded-full bg-[#a34f3f] px-1.5 text-[10px] text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </a>
  );
}
