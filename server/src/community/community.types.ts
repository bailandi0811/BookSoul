export interface MessageDTO {
  id: string;
  seq: string;
  clientMessageId: string;
  author: { memberId: string; name: string };
  content: string | null;
  status: 'ACTIVE' | 'REMOVED';
  createdAt: string;
  mentions: { memberId: string; name: string }[];
  replyTo: null | {
    id: string;
    memberId: string;
    name: string;
    excerpt: string | null;
    status: 'ACTIVE' | 'REMOVED';
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
  mentionUnreadCount: number;
  consentVersion: string;
}

export interface MessagePage {
  messages: MessageDTO[];
  hasMore: boolean;
  nextCursor: string | null;
  latestEventSeq: string;
}

export interface SendMessageInput {
  clientMessageId: string;
  content: string;
  replyToId?: string;
  mentionMemberIds?: string[];
}
export interface MessageQuery {
  before?: string;
  after?: string;
  limit: number;
}
export interface CommunityWsIdentity {
  userId: string;
  memberId: string;
  roomId: string;
  authVersion: number;
  expiresAt: number;
}
export type CommunityClientFrame =
  | { event: 'connection.resume'; data: { after: string } }
  | { event: 'message.send'; data: SendMessageInput };
export type CommunityEventDTO =
  | {
      event: 'message.created' | 'message.removed';
      data: { seq: string; message: MessageDTO };
    }
  | { event: 'cursor'; data: { seq: string } };
export type CommunityServerFrame =
  | CommunityEventDTO
  | { event: 'connection.ready'; data: { protocolVersion: 1 } }
  | { event: 'sync.complete'; data: { throughSeq: string } }
  | {
      event: 'message.ack';
      data: { clientMessageId: string; message: MessageDTO };
    }
  | { event: 'presence'; data: { onlineCount: number } }
  | { event: 'heartbeat' | 'auth.expired'; data: Record<string, never> }
  | { event: 'reset'; data: { reason: 'CURSOR_TOO_OLD' | 'SLOW_CONSUMER' } }
  | {
      event: 'error';
      data: {
        code: string;
        status: number;
        clientMessageId?: string;
        retryAfterSeconds?: number;
      };
    };
