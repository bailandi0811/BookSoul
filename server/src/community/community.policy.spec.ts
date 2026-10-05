import { HttpException } from '@nestjs/common';
import {
  normalizeMessage,
  parseSequence,
  messageRequestHash,
} from './community.policy';
import {
  parseClientFrame,
  parseMessageQuery,
  parseJoin,
} from './dto/community.dto';

function rejects(action: () => unknown, status = 400) {
  try {
    action();
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
  }
}

describe('public community input boundaries', () => {
  it('normalizes_trimmed_content', () => {
    expect(normalizeMessage('  读完一章\n 慢慢聊  ')).toBe('读完一章\n 慢慢聊');
    rejects(() => normalizeMessage(' \n '));
    rejects(() => normalizeMessage({ text: 'untrusted' }));
  });
  it('counts_unicode_code_points', () => {
    expect(Array.from(normalizeMessage('🍵'.repeat(2000)))).toHaveLength(2000);
    rejects(() => normalizeMessage('🍵'.repeat(2001)));
  });
  it('rejects_sequence_overflow', () => {
    expect(parseSequence('9223372036854775807')).toBe(9223372036854775807n);
    for (const value of ['9223372036854775808', '-1', '1e3', '01', 1])
      rejects(() => parseSequence(value));
  });
  it('hashes_normalized_content_and_reply_scope', () => {
    expect(messageRequestHash('  hello ', null)).toBe(
      messageRequestHash('hello', null),
    );
    expect(messageRequestHash('hello', null)).not.toBe(
      messageRequestHash('hello', 'quote-id'),
    );
  });
  it('rejects_spoofed_scope_fields', () => {
    rejects(() =>
      parseJoin({ consentVersion: '2026-10-04', userId: 'someone-else' }),
    );
    rejects(() =>
      parseClientFrame({
        event: 'message.send',
        data: {
          clientMessageId: 'b4b8f3f8-6521-41b9-9cbb-27ea2e2d3075',
          content: 'hello',
          role: 'moderator',
        },
      }),
    );
    expect(parseJoin({ consentVersion: '2026-10-04' })).toEqual({
      consentVersion: '2026-10-04',
    });
  });
  it('rejects_unknown_or_malformed_frame', () => {
    for (const frame of [
      null,
      [],
      { event: 'unknown', data: {} },
      { event: 'connection.resume', data: { after: 'future' } },
      { event: 'message.send', data: { content: 'hello' } },
    ])
      rejects(() => parseClientFrame(frame));
    expect(
      parseClientFrame({ event: 'connection.resume', data: { after: '0' } }),
    ).toEqual({ event: 'connection.resume', data: { after: '0' } });
  });
  it('validates_page_directions_and_limits', () => {
    expect(parseMessageQuery({})).toEqual({ limit: 50 });
    expect(parseMessageQuery({ before: '42', limit: '100' })).toEqual({
      before: '42',
      limit: 100,
    });
    rejects(() => parseMessageQuery({ before: '1', after: '2' }));
    rejects(() => parseMessageQuery({ limit: '101' }));
  });
});
