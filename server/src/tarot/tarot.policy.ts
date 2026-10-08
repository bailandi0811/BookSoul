import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import type { TarotPosition, TarotSpread } from './tarot.types';
import { TAROT_SPREADS } from './tarot-spreads.generated';

export function tarotError(
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
export function positions(spread: TarotSpread): TarotPosition[] {
  return getTarotSpread(spread).positions.map((p) => p.id);
}
export function getTarotSpread(spread: TarotSpread) {
  const definition = TAROT_SPREADS.find((item) => item.id === spread);
  if (!definition) throw tarotError(500, 'TAROT_DECK_INVALID');
  return definition;
}
const identifier = z.string().regex(/^[a-f0-9]{32}$/);
const spread = z.enum(['yes_no', 'three_card', 'triangle']);
const question = z
  .string()
  .transform((value) => value.normalize('NFC').trim())
  .refine(
    (value) => Array.from(value).length >= 1 && Array.from(value).length <= 300,
  );
export const classificationSchema = z.object({ question }).strict();
export const drawSchema = z.object({ permit: identifier, spread }).strict();
export const revealSchema = z
  .object({ readingId: identifier, index: z.number().int().min(0).max(77) })
  .strict();
export const readingSchema = z.object({ readingId: identifier }).strict();
export function parseTarot<T>(
  schema: z.ZodType<T>,
  input: unknown,
  code: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) throw tarotError(400, code);
  return result.data;
}
