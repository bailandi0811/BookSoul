import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentRunStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentAdmissionStore } from './agent-admission.store';
import type {
  AgentAdmissionRejectionReason,
  AgentAdmissionScope,
  AgentRunFinalStatus,
} from './agent-admission.types';

interface AgentAdmissionLeaseCallbacks {
  renew: () => Promise<boolean>;
  finalize: (status: AgentRunFinalStatus) => Promise<void>;
  markLeaseLost: (failureCode: string) => Promise<void>;
}

export class AgentAdmissionLease {
  private timer: NodeJS.Timeout | null = null;
  private renewing = false;
  private finalized = false;
  private leaseLost = false;

  constructor(
    readonly runId: string,
    private readonly heartbeatMs: number,
    private readonly callbacks: AgentAdmissionLeaseCallbacks,
    private readonly onLeaseLost: () => void,
  ) {
    this.timer = setInterval(() => void this.heartbeat(), heartbeatMs);
    this.timer.unref();
  }

  hasLostLease(): boolean {
    return this.leaseLost;
  }

  async finish(status: AgentRunFinalStatus): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    this.stopTimer();
    await this.callbacks.finalize(
      this.leaseLost ? AgentRunStatus.LEASE_LOST : status,
    );
  }

  private async heartbeat(): Promise<void> {
    if (this.finalized || this.leaseLost || this.renewing) return;
    this.renewing = true;
    try {
      const renewed = await this.callbacks.renew();
      if (!renewed) this.loseLease('LEASE_NOT_ACTIVE');
    } catch {
      this.loseLease('LEASE_RENEWAL_FAILED');
    } finally {
      this.renewing = false;
    }
  }

  private loseLease(failureCode: string): void {
    if (this.finalized || this.leaseLost) return;
    this.leaseLost = true;
    this.stopTimer();
    this.onLeaseLost();
    void this.callbacks.markLeaseLost(failureCode);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export type AgentAdmissionResult =
  | {
      accepted: false;
      reason: AgentAdmissionRejectionReason;
      retryAfterSeconds: number;
    }
  | { accepted: true; lease: AgentAdmissionLease };

@Injectable()
export class AgentAdmissionService {
  private readonly logger = new Logger(AgentAdmissionService.name);
  private readonly perUserLimit: number;
  private readonly globalLimit: number;
  private readonly leaseTtlMs: number;
  private readonly heartbeatMs: number;
  private readonly retryAfterSeconds: number;

  constructor(
    private readonly store: AgentAdmissionStore,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.perUserLimit =
      configService.get<number>('agentAdmission.perUserLimit') ?? 2;
    this.globalLimit =
      configService.get<number>('agentAdmission.globalLimit') ?? 20;
    this.leaseTtlMs =
      configService.get<number>('agentAdmission.leaseTtlMs') ?? 120_000;
    this.heartbeatMs =
      configService.get<number>('agentAdmission.heartbeatMs') ?? 30_000;
    this.retryAfterSeconds =
      configService.get<number>('agentAdmission.retryAfterSeconds') ?? 5;
  }

  async acquire(
    scope: AgentAdmissionScope,
    onLeaseLost: () => void,
  ): Promise<AgentAdmissionResult> {
    const runId = randomUUID();
    const now = new Date();
    const decision = await this.store.tryAcquire({
      ...scope,
      runId,
      nowMs: now.getTime(),
      leaseTtlMs: this.leaseTtlMs,
      perUserLimit: this.perUserLimit,
      globalLimit: this.globalLimit,
    });
    if (!decision.accepted) {
      return {
        accepted: false,
        reason: decision.reason,
        retryAfterSeconds: this.retryAfterSeconds,
      };
    }

    try {
      await this.prisma.agentRun.updateMany({
        where: {
          ownerId: scope.ownerId,
          sessionId: scope.sessionId,
          status: AgentRunStatus.RUNNING,
          leaseExpiresAt: { lte: now },
        },
        data: {
          status: AgentRunStatus.LEASE_LOST,
          completedAt: now,
          heartbeatAt: now,
          leaseExpiresAt: now,
          failureCode: 'LEASE_EXPIRED',
        },
      });
      await this.prisma.agentRun.create({
        data: {
          id: runId,
          ownerId: scope.ownerId,
          sessionId: scope.sessionId,
          bookId: scope.bookId,
          status: AgentRunStatus.RUNNING,
          startedAt: now,
          heartbeatAt: now,
          leaseExpiresAt: new Date(now.getTime() + this.leaseTtlMs),
        },
      });
    } catch (error) {
      await this.store
        .release({
          ownerId: scope.ownerId,
          sessionId: scope.sessionId,
          runId,
        })
        .catch(() => {
          this.logger.error(
            'Failed to release admission after run creation error',
          );
        });
      throw error;
    }

    return {
      accepted: true,
      lease: new AgentAdmissionLease(
        runId,
        this.heartbeatMs,
        {
          renew: () => this.renew(scope, runId),
          finalize: (status) => this.finalize(scope, runId, status),
          markLeaseLost: (failureCode) =>
            this.markLeaseLost(scope, runId, failureCode),
        },
        onLeaseLost,
      ),
    };
  }

  private async renew(
    scope: AgentAdmissionScope,
    runId: string,
  ): Promise<boolean> {
    const now = new Date();
    const renewed = await this.store.renew({
      ownerId: scope.ownerId,
      sessionId: scope.sessionId,
      runId,
      nowMs: now.getTime(),
      leaseTtlMs: this.leaseTtlMs,
    });
    if (!renewed) return false;

    const updated = await this.prisma.agentRun.updateMany({
      where: { id: runId, status: AgentRunStatus.RUNNING },
      data: {
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + this.leaseTtlMs),
      },
    });
    return updated.count === 1;
  }

  private async finalize(
    scope: AgentAdmissionScope,
    runId: string,
    status: AgentRunFinalStatus,
  ): Promise<void> {
    await this.store
      .release({
        ownerId: scope.ownerId,
        sessionId: scope.sessionId,
        runId,
      })
      .catch(() => {
        this.logger.error('Failed to release an Agent admission lease');
      });

    const now = new Date();
    await this.prisma.agentRun
      .updateMany({
        where: { id: runId, status: AgentRunStatus.RUNNING },
        data: {
          status,
          completedAt: now,
          heartbeatAt: now,
          leaseExpiresAt: now,
          failureCode:
            status === AgentRunStatus.LEASE_LOST ? 'LEASE_LOST' : null,
        },
      })
      .catch(() => {
        this.logger.error('Failed to persist final Agent run status');
      });
  }

  private async markLeaseLost(
    scope: AgentAdmissionScope,
    runId: string,
    failureCode: string,
  ): Promise<void> {
    await this.store
      .release({
        ownerId: scope.ownerId,
        sessionId: scope.sessionId,
        runId,
      })
      .catch(() => {
        this.logger.error('Failed to release a lost Agent admission lease');
      });
    const now = new Date();
    await this.prisma.agentRun
      .updateMany({
        where: { id: runId, status: AgentRunStatus.RUNNING },
        data: {
          status: AgentRunStatus.LEASE_LOST,
          completedAt: now,
          heartbeatAt: now,
          leaseExpiresAt: now,
          failureCode,
        },
      })
      .catch(() => {
        this.logger.error('Failed to persist lost Agent run lease');
      });
  }
}
