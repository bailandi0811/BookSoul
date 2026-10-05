export interface CommunityMessage {
  id: string;
  seq: string;
  clientMessageId: string;
  author: { memberId: string; name: string };
  content: string | null;
  status: "ACTIVE" | "REMOVED";
  createdAt: string;
  mentions?: CommunityMention[];
  replyTo: null | {
    id: string;
    memberId: string;
    name: string;
    excerpt: string | null;
    status: "ACTIVE" | "REMOVED";
  };
}
export interface CommunitySummary {
  memberId: string;
  isModerator: boolean;
  mutedUntil: string | null;
  lastReadSeq: string;
  unreadCount: number;
  replyUnreadCount: number;
  latestEventSeq: string;
  mentionUnreadCount?: number;
  consentVersion?: string;
}
export interface CommunityMessagePage {
  messages: CommunityMessage[];
  hasMore: boolean;
  nextCursor: string | null;
  latestEventSeq: string;
}
export interface CommunitySend {
  clientMessageId: string;
  content: string;
  replyToId?: string;
  mentionMemberIds?: string[];
}
export interface CommunityMention {
  memberId: string;
  name: string;
}
export interface CommunityPublicMember extends CommunityMention {
  avatarRevision: string | null;
}
export interface CommunityMessageContext {
  messages: CommunityMessage[];
  hasOlder: boolean;
  hasNewer: boolean;
  latestEventSeq: string;
}
export type CommunityFrame =
  | {
      event: "message.created" | "message.removed";
      data: { seq: string; message: CommunityMessage };
    }
  | { event: "cursor"; data: { seq: string } }
  | { event: "connection.ready"; data: { protocolVersion: 1 } }
  | { event: "sync.complete"; data: { throughSeq: string } }
  | {
      event: "message.ack";
      data: { clientMessageId: string; message: CommunityMessage };
    }
  | { event: "presence"; data: { onlineCount: number } }
  | { event: "heartbeat" | "auth.expired"; data: Record<string, never> }
  | { event: "reset"; data: { reason: "CURSOR_TOO_OLD" | "SLOW_CONSUMER" } }
  | {
      event: "error";
      data: {
        code: string;
        status: number;
        clientMessageId?: string;
        retryAfterSeconds?: number;
      };
    };
