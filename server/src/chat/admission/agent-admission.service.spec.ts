import { ConfigService } from '@nestjs/config';
import { AgentRunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AgentAdmissionLease,
  AgentAdmissionService,
} from './agent-admission.service';
import { AgentAdmissionStore } from './agent-admission.store';

describe('AgentAdmissionService', () => {
  const scope = {
    ownerId: 'user-a',
    sessionId: 'session-a',
    bookId: 'book-a',
  };
  let store: {
    tryAcquire: jest.Mock;
    renew: jest.Mock;
    release: jest.Mock;
  };
  let prisma: {
    agentRun: {
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: AgentAdmissionService;

  beforeEach(() => {
    store = {
      tryAcquire: jest.fn().mockResolvedValue({ accepted: true }),
      renew: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      agentRun: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const values: Record<string, number> = {
      'agentAdmission.perUserLimit': 2,
      'agentAdmission.globalLimit': 20,
      'agentAdmission.leaseTtlMs': 120_000,
      'agentAdmission.heartbeatMs': 30_000,
      'agentAdmission.retryAfterSeconds': 5,
    };
    service = new AgentAdmissionService(
      store as unknown as AgentAdmissionStore,
      prisma as unknown as PrismaService,
      {
        get: jest.fn((key: string) => values[key]),
      } as unknown as ConfigService,
    );
  });

  it('persists an accepted run and releases it with its final status', async () => {
    const result = await service.acquire(scope, jest.fn());
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error('Expected admission');

    expect(store.tryAcquire).toHaveBeenCalledWith(
      expect.objectContaining({
        ...scope,
        perUserLimit: 2,
        globalLimit: 20,
      }),
    );
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'user-a',
        sessionId: 'session-a',
        bookId: 'book-a',
        status: AgentRunStatus.RUNNING,
      }),
    });

    await result.lease.finish(AgentRunStatus.SUCCEEDED);

    expect(store.release).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: scope.ownerId,
        sessionId: scope.sessionId,
        runId: result.lease.runId,
      }),
    );
    expect(prisma.agentRun.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: result.lease.runId, status: AgentRunStatus.RUNNING },
        data: expect.objectContaining({ status: AgentRunStatus.SUCCEEDED }),
      }),
    );
  });

  it('returns a bounded rejection without creating an audit record', async () => {
    store.tryAcquire.mockResolvedValue({
      accepted: false,
      reason: 'USER_LIMIT',
    });

    await expect(service.acquire(scope, jest.fn())).resolves.toEqual({
      accepted: false,
      reason: 'USER_LIMIT',
      retryAfterSeconds: 5,
    });
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it('releases the admission slot when audit record creation fails', async () => {
    prisma.agentRun.create.mockRejectedValue(new Error('database unavailable'));

    await expect(service.acquire(scope, jest.fn())).rejects.toThrow(
      'database unavailable',
    );
    expect(store.release).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: scope.ownerId,
        sessionId: scope.sessionId,
      }),
    );
  });
});

describe('AgentAdmissionLease', () => {
  afterEach(() => jest.useRealTimers());

  it('cancels the run and persists lease loss when renewal is rejected', async () => {
    jest.useFakeTimers();
    const onLeaseLost = jest.fn();
    const callbacks = {
      renew: jest.fn().mockResolvedValue(false),
      finalize: jest.fn().mockResolvedValue(undefined),
      markLeaseLost: jest.fn().mockResolvedValue(undefined),
    };
    const lease = new AgentAdmissionLease('run-a', 10, callbacks, onLeaseLost);

    await jest.advanceTimersByTimeAsync(10);

    expect(onLeaseLost).toHaveBeenCalledTimes(1);
    expect(callbacks.markLeaseLost).toHaveBeenCalledWith('LEASE_NOT_ACTIVE');
    expect(lease.hasLostLease()).toBe(true);

    await lease.finish(AgentRunStatus.SUCCEEDED);
    expect(callbacks.finalize).toHaveBeenCalledWith(AgentRunStatus.LEASE_LOST);
  });
});
