import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const COMMUNITY_ROOM_ID = 'readers-lobby';
export const COMMUNITY_ROOM = Symbol('COMMUNITY_ROOM');
export const COMMUNITY_PROTOCOL = 'booksoul.community.v1';
export const COMMUNITY_PATH = '/api/community/ws';
export const CONSENT_VERSION = '2026-10-04';
export const AVATAR_CONSENT_VERSION = '2026-10-05';
export const POLICY = {
  maxContent: 2000,
  quoteLength: 120,
  sendsPerMinute: 20,
  memberConnections: 3,
  totalConnections: 100,
  ticketTtlMs: 30_000,
  memberTickets: 2,
  totalTickets: 200,
  heartbeatMs: 15_000,
  pongMs: 10_000,
  handshakeMs: 10_000,
  syncMs: 10_000,
  sweepMs: 1000,
  replayBatch: 100,
  replayLag: 1000,
  maxPayload: 16 * 1024,
  incomingFrames: 60,
  incomingWindowMs: 10_000,
  incomingQueue: 20,
  outgoingQueue: 100,
  bufferedBytes: 256 * 1024,
  sendTimeoutMs: 5000,
  closeTimeoutMs: 5000,
} as const;

export function communityError(
  status: number,
  code: string,
  retryAfterSeconds?: number,
): HttpException {
  return new HttpException(
    {
      code,
      message: code,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
    status,
  );
}

export function normalizeMessage(content: unknown): string {
  if (typeof content !== 'string')
    throw communityError(400, 'COMMUNITY_INVALID_CONTENT');
  const result = content.trim();
  const length = Array.from(result).length;
  if (length < 1 || length > POLICY.maxContent)
    throw communityError(400, 'COMMUNITY_INVALID_CONTENT');
  return result;
}

export function parseSequence(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(value))
    throw communityError(400, 'COMMUNITY_INVALID_CURSOR');
  const seq = BigInt(value);
  if (seq > 9223372036854775807n)
    throw communityError(400, 'COMMUNITY_INVALID_CURSOR');
  return seq;
}

export function messageRequestHash(
  content: string,
  replyToId: string | null,
  mentionMemberIds: string[] = [],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        mentionMemberIds.length
          ? [
              normalizeMessage(content),
              replyToId,
              [...new Set(mentionMemberIds)].sort(),
            ]
          : [normalizeMessage(content), replyToId],
      ),
    )
    .digest('hex');
}

export function errorFrameData(error: unknown): {
  status: number;
  code: string;
  retryAfterSeconds?: number;
} {
  if (!(error instanceof HttpException))
    return { status: 503, code: 'COMMUNITY_UNAVAILABLE' };
  const response = error.getResponse();
  if (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    typeof response.code === 'string'
  ) {
    return {
      status: error.getStatus(),
      code: response.code,
      ...('retryAfterSeconds' in response &&
      typeof response.retryAfterSeconds === 'number'
        ? { retryAfterSeconds: response.retryAfterSeconds }
        : {}),
    };
  }
  return { status: error.getStatus(), code: 'COMMUNITY_REQUEST_REJECTED' };
}
