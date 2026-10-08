import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  buildTarotReadingMessages,
  TAROT_READING_PROMPT_VERSION,
} from './tarot-reading.prompt';
import {
  loadTarotSelectionSkill,
  TAROT_READING_SKILL_METADATA,
} from '../agent-skills/tarot-agent-skills';
import type { TarotReadingInput, TarotClassification } from './tarot.types';

const probability = z.number().finite().min(0).max(1);
const responseSchema = z.object({
  model: z.string(),
  usage: z
    .object({
      input_tokens: z.number().finite().nonnegative(),
      output_tokens: z.number().finite().nonnegative(),
    })
    .optional(),
  answers: z.object({
    spread: z.object({
      type: z.literal('choice'),
      choice: z.enum(['yes_no', 'three_card', 'triangle', 'unclear']),
      confidence: probability,
      probabilities: z
        .object({
          yes_no: probability,
          three_card: probability,
          triangle: probability,
          unclear: probability,
        })
        .strict()
        .refine(
          (p) =>
            Math.abs(p.yes_no + p.three_card + p.triangle + p.unclear - 1) <=
            0.001,
        ),
    }),
  }),
});
const unavailable: TarotClassification = {
  mode: 'choose',
  spread: null,
  reason: 'unavailable',
};
function deadline(signal: AbortSignal, milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Tarot request timed out')),
    milliseconds,
  );
  return {
    signal: AbortSignal.any([signal, controller.signal]),
    dispose: () => clearTimeout(timer),
  };
}

@Injectable()
export class TarotProviderService {
  private readonly logger = new Logger(TarotProviderService.name);
  constructor(private readonly config: ConfigService) {}

  async classify(
    question: string,
    signal: AbortSignal,
  ): Promise<TarotClassification> {
    signal.throwIfAborted();
    const key = this.config.get<string>('tarot.apiKey')?.trim();
    if (!key || /^(replace|your[-_]|placeholder|changeme)/i.test(key))
      return unavailable;
    const skill = loadTarotSelectionSkill();
    const runId = randomUUID();
    const started = Date.now();
    const call = deadline(signal, 5000);
    try {
      const base =
        this.config.get<string>('tarot.baseUrl') || 'https://api.typesafe.ai';
      const path = this.config.get<string>('tarot.apiPath') || '/v1/systemone';
      const model = this.config.get<string>('tarot.model') || 'jev-latest';
      const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: call.signal,
        body: JSON.stringify({
          model,
          state: question,
          questions: {
            spread: skill.content,
          },
        }),
      });
      if (!response.ok) return unavailable;
      const payload: unknown = await response.json();
      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) return unavailable;
      const answer = parsed.data.answers.spread;
      const fixed = answer.choice !== 'unclear' && answer.confidence >= 0.8;
      this.logger.log(
        JSON.stringify({
          runId,
          stage: 'classification',
          ruleVersion: skill.skillVersion,
          agentId: skill.agentId,
          skillId: skill.skillId,
          skillVersion: skill.skillVersion,
          model: parsed.data.model,
          tokens: parsed.data.usage,
          durationMs: Date.now() - started,
          choice: answer.choice,
          thresholdMet: fixed,
        }),
      );
      if (answer.choice === 'unclear')
        return { mode: 'choose', spread: null, reason: 'unclear' };
      return fixed
        ? { mode: 'fixed', spread: answer.choice, reason: null }
        : { mode: 'choose', spread: null, reason: 'low_confidence' };
    } catch {
      signal.throwIfAborted();
      this.logger.warn(
        JSON.stringify({
          runId,
          stage: 'classification',
          durationMs: Date.now() - started,
          code: 'TAROT_CLASSIFICATION_UNAVAILABLE',
        }),
      );
      return unavailable;
    } finally {
      call.dispose();
    }
  }

  async *read(
    input: TarotReadingInput,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    signal.throwIfAborted();
    const messages = buildTarotReadingMessages(input);
    const timeout =
      this.config.get<number>('openai.requestTimeoutMs') || 20_000;
    const call = deadline(signal, timeout);
    const runId = randomUUID();
    const started = Date.now();
    try {
      const model = new ChatOpenAI({
        apiKey: this.config.get<string>('openai.apiKey'),
        model: this.config.get<string>('openai.chatModel'),
        configuration: { baseURL: this.config.get<string>('openai.baseUrl') },
        maxRetries: 0,
        maxTokens: 800,
        timeout,
        streaming: true,
        temperature: 0.7,
      });
      const stream = await model.stream(messages, { signal: call.signal });
      for await (const chunk of stream) {
        call.signal.throwIfAborted();
        if (typeof chunk.content === 'string' && chunk.content)
          yield chunk.content;
        else if (Array.isArray(chunk.content))
          for (const block of chunk.content) {
            if (
              typeof block === 'object' &&
              block.type === 'text' &&
              typeof block.text === 'string'
            )
              yield block.text;
          }
        if (chunk.usage_metadata)
          this.logger.log(
            JSON.stringify({
              runId,
              stage: 'reading',
              promptVersion: TAROT_READING_PROMPT_VERSION,
              agentId: 'tarot-interpreter',
              skillId: TAROT_READING_SKILL_METADATA.id,
              skillVersion: TAROT_READING_SKILL_METADATA.version,
              model: this.config.get<string>('openai.chatModel'),
              durationMs: Date.now() - started,
              tokens: chunk.usage_metadata,
            }),
          );
      }
      call.signal.throwIfAborted();
    } finally {
      call.dispose();
    }
  }
}
