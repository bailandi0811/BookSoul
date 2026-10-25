export interface HistoryMessagePageItem {
  id: string;
  position: number;
  role: "user" | "assistant";
  content: string;
}

export interface HistoryMessagePage {
  items: HistoryMessagePageItem[];
  nextCursor: number | null;
  hasMore: boolean;
}

export function createClientMessageId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
