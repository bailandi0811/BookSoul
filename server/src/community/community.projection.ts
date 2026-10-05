import { Prisma } from '@prisma/client';
import { POLICY } from './community.policy';
import type { MessageDTO } from './community.types';

export const messageSelect = {
  id: true,
  createdSeq: true,
  clientMessageId: true,
  authorMemberId: true,
  authorName: true,
  content: true,
  mentions: true,
  author: { select: { user: { select: { name: true } } } },
  removedAt: true,
  createdAt: true,
  replyTo: {
    select: {
      id: true,
      roomId: true,
      authorMemberId: true,
      authorName: true,
      content: true,
      removedAt: true,
    },
  },
  roomId: true,
} satisfies Prisma.CommunityMessageSelect;
export type CommunityMessageProjection = Prisma.CommunityMessageGetPayload<{
  select: typeof messageSelect;
}>;

export function projectMessage(
  row: Omit<CommunityMessageProjection, 'author' | 'mentions'> &
    Partial<Pick<CommunityMessageProjection, 'author' | 'mentions'>>,
): MessageDTO {
  // Both live reads and replay use current tombstones; old events never restore text.
  const reply = row.replyTo?.roomId === row.roomId ? row.replyTo : null;
  return {
    id: row.id,
    seq: row.createdSeq.toString(),
    clientMessageId: row.clientMessageId,
    author: {
      memberId: row.authorMemberId,
      name: row.author?.user.name ?? row.authorName,
    },
    mentions: row.removedAt ? [] : projectMentions(row.mentions),
    content: row.removedAt ? null : row.content,
    status: row.removedAt ? 'REMOVED' : 'ACTIVE',
    createdAt: row.createdAt.toISOString(),
    replyTo: reply
      ? {
          id: reply.id,
          memberId: reply.authorMemberId,
          name: reply.authorName,
          excerpt: reply.removedAt
            ? null
            : Array.from(reply.content ?? '')
                .slice(0, POLICY.quoteLength)
                .join(''),
          status: reply.removedAt ? 'REMOVED' : 'ACTIVE',
        }
      : null,
  };
}

function projectMentions(
  value: Prisma.JsonValue | undefined,
): MessageDTO['mentions'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof item.memberId === 'string' &&
    typeof item.name === 'string'
      ? [{ memberId: item.memberId, name: item.name }]
      : [],
  );
}
