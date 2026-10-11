import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, Subject } from 'rxjs';
import { LegacyBookUploadLimitInterceptor } from './legacy-book-upload-limit.interceptor';

function context(userId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ authContext: { kind: 'user', userId } }),
    }),
  } as unknown as ExecutionContext;
}
describe('legacy upload memory admission', () => {
  it('rejects excess requests before parsing the body and releases slots on unsubscribe', async () => {
    const limiter = new LegacyBookUploadLimitInterceptor();
    const stream = new Subject<void>();
    const handler = { handle: () => stream } as CallHandler;
    const first = limiter.intercept(context('a'), handler).subscribe();
    const second = limiter.intercept(context('b'), handler).subscribe();
    expect(() => limiter.intercept(context('c'), handler)).toThrow();
    expect(() => limiter.intercept(context('a'), handler)).toThrow();
    first.unsubscribe();
    second.unsubscribe();
    await expect(
      lastValueFrom(
        limiter.intercept(context('a'), { handle: () => of('accepted') }),
      ),
    ).resolves.toBe('accepted');
  });
});
