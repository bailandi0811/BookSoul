import { z } from 'zod';
import {
  communityError,
  CONSENT_VERSION,
  AVATAR_CONSENT_VERSION,
  normalizeMessage,
  parseSequence,
} from '../community.policy';

const sequence = z.string().refine((value) => {
  try {
    parseSequence(value);
    return true;
  } catch {
    return false;
  }
});
const content = z.string().transform((value) => normalizeMessage(value));
export const sendSchema = z
  .object({
    clientMessageId: z.uuid(),
    content,
    replyToId: z.uuid().optional(),
    mentionMemberIds: z
      .array(z.uuid())
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
  })
  .strict();
const frameSchema = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('connection.resume'),
      data: z.object({ after: sequence }).strict(),
    })
    .strict(),
  z.object({ event: z.literal('message.send'), data: sendSchema }).strict(),
]);
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw communityError(400, 'COMMUNITY_INVALID_INPUT');
  return result.data;
}
export const parseClientFrame = (input: unknown) => parse(frameSchema, input);
export const parseSend = (input: unknown) => parse(sendSchema, input);
export const parseJoin = (input: unknown) =>
  parse(
    z
      .object({
        consentVersion: z.enum([CONSENT_VERSION, AVATAR_CONSENT_VERSION]),
      })
      .strict(),
    input,
  );
export const parseRead = (input: unknown) =>
  parse(z.object({ throughSeq: sequence }).strict(), input);
export const parseId = (input: unknown) => parse(z.uuid(), input);
export const parseVisibleRead = (input: unknown) =>
  parse(
    z.object({ messageIds: z.array(z.uuid()).min(1).max(100) }).strict(),
    input,
  );
export const parseUnreadQuery = (input: unknown) =>
  parse(
    z
      .object({
        kind: z.enum(['all', 'mentions']).default('all'),
        after: sequence.optional(),
      })
      .strict(),
    input,
  );
export const parseHide = (input: unknown) =>
  parse(
    z
      .object({
        reason: z
          .string()
          .trim()
          .refine(
            (value) =>
              Array.from(value).length >= 1 && Array.from(value).length <= 200,
          ),
      })
      .strict(),
    input,
  );
export const parseMute = (input: unknown) =>
  parse(
    z
      .object({
        clientActionId: z.uuid(),
        minutes: z.union([z.literal(10), z.literal(60)]),
        reason: z
          .string()
          .trim()
          .refine(
            (value) =>
              Array.from(value).length >= 1 && Array.from(value).length <= 200,
          ),
      })
      .strict(),
    input,
  );
export function parseMessageQuery(input: unknown) {
  return parse(
    z
      .object({
        before: sequence.optional(),
        after: sequence.optional(),
        limit: z
          .string()
          .regex(/^\d{1,3}$/)
          .transform(Number)
          .refine((value) => value >= 1 && value <= 100)
          .optional()
          .default(50),
      })
      .strict()
      .refine((value) => !(value.before && value.after)),
    input,
  );
}
