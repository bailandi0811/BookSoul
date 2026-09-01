import { ConfigService } from '@nestjs/config';
import { AgentAdmissionStore } from './agent-admission.store';
import type { AgentAdmissionStoreInput } from './agent-admission.types';

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
