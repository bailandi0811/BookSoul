import { OperationTimeoutError, withTimeout } from './promise-timeout';

describe('withTimeout', () => {
  it('returns a completed operation', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'test')).resolves.toBe(
      'ok',
    );
  });

  it('rejects an operation that exceeds its deadline', async () => {
    const pending = new Promise<never>(() => undefined);
    await expect(withTimeout(pending, 5, 'slow test')).rejects.toEqual(
      expect.objectContaining<Partial<OperationTimeoutError>>({
        name: 'OperationTimeoutError',
        operation: 'slow test',
        timeoutMs: 5,
      }),
    );
  });
});
