import { Layers } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
export function TarotEntry() {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  if (!authenticated) return null;
  return (
    <a
      href="#tarot"
      className="tarot-entry relative flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/80 px-2 py-2 text-xs text-foreground sm:px-2.5"
      onMouseEnter={() => void import("./TarotPage")}
      onFocus={() => void import("./TarotPage")}
    >
      <Layers size={15} strokeWidth={1.4} />
      <span>心绪塔罗</span>
    </a>
  );
}
