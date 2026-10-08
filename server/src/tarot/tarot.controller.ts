import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentAuth } from '../auth/decorators/auth-context.decorator';
import type { AuthContext } from '../auth/auth-context';
import { TarotAuthGuard } from './tarot-auth.guard';
import {
  classificationSchema,
  drawSchema,
  readingSchema,
  revealSchema,
  parseTarot,
  tarotError,
} from './tarot.policy';
import { TarotStateService } from './tarot-state.service';
import { TarotProviderService } from './tarot-provider.service';

@Controller('api/tarot')
@UseGuards(TarotAuthGuard)
export class TarotController {
  constructor(
    private readonly state: TarotStateService,
    private readonly provider: TarotProviderService,
  ) {}
  private owner(auth: AuthContext) {
    if (auth.kind !== 'user') throw tarotError(401, 'TAROT_UNAUTHENTICATED');
    return auth.userId;
  }
  private async response<T>(
    res: Response,
    operation: () => T | Promise<T>,
  ): Promise<T> {
    res.setHeader('Cache-Control', 'no-store');
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        const body = error.getResponse();
        if (typeof body === 'object' && 'retryAfterSeconds' in body)
          res.setHeader('Retry-After', String(body.retryAfterSeconds));
      }
      throw error;
    }
  }
  @Post('classifications')
  @HttpCode(200)
  async classify(
    @CurrentAuth() auth: AuthContext,
    @Body() input: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.response(res, async () => {
      const owner = this.owner(auth);
      const { question } = parseTarot(
        classificationSchema,
        input,
        'TAROT_QUESTION_INVALID',
      );
      this.state.count(owner, 'classification');
      this.state.invalidate(owner);
      const run = this.state.beginRun(owner, 'classification');
      const controller = new AbortController();
      const onClose = () => controller.abort();
      res.once('close', onClose);
      try {
        const result = await this.provider.classify(
          question,
          AbortSignal.any([run.signal, controller.signal]),
        );
        if (
          controller.signal.aborted ||
          !this.state.isCurrentRun(owner, run.id)
        )
          throw tarotError(409, 'TAROT_CLASSIFICATION_CANCELLED');
        return {
          ...result,
          permit: this.state.createPermit(owner, question, result),
        };
      } finally {
        res.off('close', onClose);
        run.release();
      }
    });
  }
  @Post('draws')
  @HttpCode(200)
  async draw(
    @CurrentAuth() auth: AuthContext,
    @Body() input: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.response(res, () => {
      const owner = this.owner(auth);
      const body = parseTarot(drawSchema, input, 'TAROT_PERMIT_INVALID');
      this.state.count(owner, 'draw');
      return this.state.draw(owner, body.permit, body.spread);
    });
  }
  @Post('reveals')
  @HttpCode(200)
  async reveal(
    @CurrentAuth() auth: AuthContext,
    @Body() input: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.response(res, () => {
      const owner = this.owner(auth);
      const body = parseTarot(revealSchema, input, 'TAROT_DRAW_INVALID');
      this.state.count(owner, 'reveal');
      return this.state.reveal(owner, body.readingId, body.index);
    });
  }
  @Post('readings')
  @HttpCode(200)
  async read(
    @CurrentAuth() auth: AuthContext,
    @Body() input: unknown,
    @Res() res: Response,
  ) {
    return this.response(res, async () => {
      const owner = this.owner(auth);
      const { readingId } = parseTarot(
        readingSchema,
        input,
        'TAROT_DRAW_INVALID',
      );
      this.state.count(owner, 'reading');
      const data = this.state.getReading(owner, readingId);
      const run = this.state.beginRun(owner, 'reading', readingId);
      const controller = new AbortController();
      const onClose = () => controller.abort();
      res.once('close', onClose);
      const signal = AbortSignal.any([controller.signal, run.signal]);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      const write = (event: unknown) => {
        if (!signal.aborted && !res.destroyed && !res.writableEnded)
          res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      try {
        for await (const content of this.provider.read(data, signal)) {
          if (signal.aborted) break;
          write({ content });
        }
        if (!signal.aborted) write({ done: true });
      } catch {
        write({
          error: {
            code: 'TAROT_INTERPRET_FAILED',
            message: '解读暂时没有完成，牌面仍然可以看',
          },
        });
      } finally {
        res.off('close', onClose);
        run.release();
        if (!res.destroyed && !res.writableEnded) res.end();
      }
    });
  }
}
