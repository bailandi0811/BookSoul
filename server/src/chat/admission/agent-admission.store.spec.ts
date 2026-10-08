import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { AgentAdmissionStore } from './agent-admission.store';
import type { AgentAdmissionStoreInput } from './agent-admission.types';

jest.mock('redis', () => ({ createClient: jest.fn() }));

describe('AgentAdmissionStore local mode', () => {
  let store: AgentAdmissionStore;

  beforeEach(() => {
    store = new AgentAdmissionStore({
      get: jest.fn((key: string) =>
        key === 'agentAdmission.mode' ? 'local' : undefined,
      ),
    } as unknown as ConfigService);
  });

  const input = (
    overrides: Partial<AgentAdmissionStoreInput> = {},
  ): AgentAdmissionStoreInput => ({
    ownerId: 'user-a',
    sessionId: 'session-a',
    bookId: 'book-a',
    runId: 'run-a',
    nowMs: 1_000,
    leaseTtlMs: 100,
    perUserLimit: 2,
    globalLimit: 3,
    ...overrides,
  });

  it('allows different users while rejecting a second run for one session', async () => {
    await expect(store.tryAcquire(input())).resolves.toEqual({
      accepted: true,
    });
    await expect(store.tryAcquire(input({ runId: 'run-b' }))).resolves.toEqual({
      accepted: false,
      reason: 'SESSION_BUSY',
    });
    await expect(
      store.tryAcquire(
        input({ ownerId: 'user-b', runId: 'run-c', bookId: 'book-b' }),
      ),
    ).resolves.toEqual({ accepted: true });
  });

  it('enforces per-user and global limits independently', async () => {
    await store.tryAcquire(input());
    await store.tryAcquire(input({ sessionId: 'session-b', runId: 'run-b' }));

    await expect(
      store.tryAcquire(input({ sessionId: 'session-c', runId: 'run-c' })),
    ).resolves.toEqual({ accepted: false, reason: 'USER_LIMIT' });

    await store.tryAcquire(
      input({ ownerId: 'user-b', sessionId: 'session-d', runId: 'run-d' }),
    );
    await expect(
      store.tryAcquire(
        input({ ownerId: 'user-c', sessionId: 'session-e', runId: 'run-e' }),
      ),
    ).resolves.toEqual({ accepted: false, reason: 'GLOBAL_LIMIT' });
  });

  it('expires abandoned leases and fences a late release from an older run', async () => {
    await store.tryAcquire(input());
    await expect(
      store.tryAcquire(input({ runId: 'run-b', nowMs: 1_101 })),
    ).resolves.toEqual({ accepted: true });

    await store.release({
      ownerId: 'user-a',
      sessionId: 'session-a',
      runId: 'run-a',
    });

    await expect(
      store.tryAcquire(input({ runId: 'run-c', nowMs: 1_102 })),
    ).resolves.toEqual({ accepted: false, reason: 'SESSION_BUSY' });
  });

  it('renews and releases only the active run', async () => {
    await store.tryAcquire(input());
    await expect(
      store.renew({
        ownerId: 'user-a',
        sessionId: 'session-a',
        runId: 'run-a',
        nowMs: 1_050,
        leaseTtlMs: 100,
      }),
    ).resolves.toBe(true);
    await expect(
      store.renew({
        ownerId: 'user-a',
        sessionId: 'session-a',
        runId: 'run-old',
        nowMs: 1_060,
        leaseTtlMs: 100,
      }),
    ).resolves.toBe(false);

    await store.release({
      ownerId: 'user-a',
      sessionId: 'session-a',
      runId: 'run-a',
    });
    await expect(
      store.tryAcquire(input({ runId: 'run-b', nowMs: 1_061 })),
    ).resolves.toEqual({ accepted: true });
  });
});

describe('AgentAdmissionStore Redis startup', () => {
  const redis = {
    on: jest.fn(),
    connect: jest.fn(),
    destroy: jest.fn(),
    eval: jest.fn(),
    isOpen: true,
  };
  let store: AgentAdmissionStore;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    redis.isOpen = true;
    jest
      .mocked(createClient)
      .mockReturnValue(redis as unknown as ReturnType<typeof createClient>);
    store = new AgentAdmissionStore({
      get: jest.fn((key: string) => {
        if (key === 'agentAdmission.mode') return 'redis';
        if (key === 'agentAdmission.redisUrl')
          return 'redis://fixture:fixture-secret@redis.example.invalid:6379';
        return undefined;
      }),
    } as unknown as ConfigService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects startup within five seconds and stops an endless reconnect', async () => {
    let finish!: () => void;
    redis.connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let outcome = 'pending';
    const initialization = store.onModuleInit().then(
      () => {
        outcome = 'ready';
      },
      (error: unknown) => {
        outcome = error instanceof Error ? error.message : String(error);
      },
    );
    try {
      await jest.advanceTimersByTimeAsync(5_000);
      expect(outcome).toContain(
        'Failed to connect to the Redis agent admission store',
      );
      expect(outcome).not.toContain('fixture-secret');
      expect(redis.destroy).toHaveBeenCalledTimes(1);
    } finally {
      finish();
      await initialization;
    }
  });

  it('cleans up a rejected connection and keeps admission closed without local fallback', async () => {
    redis.connect.mockRejectedValue(new Error('fixture-secret'));
    await expect(store.onModuleInit()).rejects.toThrow(
      'Failed to connect to the Redis agent admission store',
    );
    expect(redis.destroy).toHaveBeenCalledTimes(1);
    redis.eval.mockRejectedValue(new Error('connection closed'));
    await expect(
      store.tryAcquire({
        ownerId: 'fixture-owner',
        sessionId: 'fixture-session',
        bookId: 'fixture-book',
        runId: 'fixture-run',
        nowMs: 1_000,
        leaseTtlMs: 100,
        perUserLimit: 2,
        globalLimit: 3,
      }),
    ).rejects.toThrow('Agent admission store is unavailable');
  });

  it('keeps a successful Redis connection until application shutdown', async () => {
    redis.connect.mockResolvedValue(undefined);
    await expect(store.onModuleInit()).resolves.toBeUndefined();
    expect(redis.destroy).not.toHaveBeenCalled();
    store.onApplicationShutdown();
    expect(redis.destroy).toHaveBeenCalledTimes(1);
  });
});
