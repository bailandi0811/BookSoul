import { AuthMailDispatcher } from './auth-mail-dispatcher.service';
describe('bounded mail dispatcher', () => {
  it('runs at most two jobs and rejects the 101st unfinished job', async () => {
    const dispatcher = new AuthMailDispatcher();
    const started: number[] = [];
    const release: (() => void)[] = [];
    for (let i = 0; i < 100; i++)
      dispatcher.enqueue(() => {
        started.push(i);
        return new Promise<void>((resolve) => release.push(resolve));
      });
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(() => dispatcher.enqueue(async () => undefined)).toThrow();
    release[0]();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(started).toEqual([0, 1, 2]);
    const shutdown = dispatcher.onApplicationShutdown();
    expect(() => dispatcher.assertCapacity()).toThrow();
    release[1]();
    release[2]();
    await shutdown;
    expect(started).toHaveLength(3);
  });
  it('handles failures and frees a real completed slot', async () => {
    const dispatcher = new AuthMailDispatcher();
    const next = jest.fn().mockResolvedValue(undefined);
    dispatcher.enqueue(() => Promise.reject(new Error('private error')));
    dispatcher.enqueue(next);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledTimes(1);
    await dispatcher.onApplicationShutdown();
  });
});
