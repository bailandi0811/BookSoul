import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  UnauthorizedException,
  type ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TarotAuthGuard } from './tarot-auth.guard';

describe('tarot integration boundaries', () => {
  afterEach(() => jest.restoreAllMocks());
  it('maps the existing JWT rejection to an independent 401 code', async () => {
    jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockRejectedValue(new UnauthorizedException());
    try {
      await new TarotAuthGuard().canActivate({} as ExecutionContext);
      throw new Error('Expected authentication rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(401);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'TAROT_UNAUTHENTICATED',
      });
    }
  });
  it('does not import private reading, RAG, memory or vector modules', () => {
    const source = readFileSync(resolve(__dirname, 'tarot.module.ts'), 'utf8');
    expect(source).not.toMatch(
      /BooksModule|ChatModule|AgentModule|RagModule|MemoryModule|VectorModule|PrismaModule|CommunityModule/,
    );
    const client = resolve(
      __dirname,
      '../../../client/src/components/Tarot/useTarotRound.ts',
    );
    expect(readFileSync(client, 'utf8')).not.toMatch(
      /localStorage|sessionStorage|useChatStore|useMemoryStore/,
    );
  });
});
