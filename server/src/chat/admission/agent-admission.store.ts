import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import type {
  AgentAdmissionStoreDecision,
  AgentAdmissionStoreInput,
} from './agent-admission.types';

const ACQUIRE_SCRIPT = `
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local leaseTtlMs = tonumber(ARGV[1])
local perUserLimit = tonumber(ARGV[2])
local globalLimit = tonumber(ARGV[3])
local runId = ARGV[4]
local expiresAt = now + leaseTtlMs

redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)

if redis.call('EXISTS', KEYS[1]) == 1 then
  return -1
end
if redis.call('ZCARD', KEYS[2]) >= perUserLimit then
  return -2
end
if redis.call('ZCARD', KEYS[3]) >= globalLimit then
  return -3
end

redis.call('SET', KEYS[1], runId, 'PX', leaseTtlMs, 'NX')
redis.call('ZADD', KEYS[2], expiresAt, runId)
redis.call('ZADD', KEYS[3], expiresAt, runId)
return 1
`;

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
redis.call('ZADD', KEYS[2], now + tonumber(ARGV[2]), ARGV[1])
redis.call('ZADD', KEYS[3], now + tonumber(ARGV[2]), ARGV[1])
return 1
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
end
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
return 1
`;

interface LocalLease {
  runId: string;
  expiresAt: number;
}

@Injectable()
export class AgentAdmissionStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentAdmissionStore.name);
  private readonly mode: 'local' | 'redis';
  private readonly redisUrl?: string;
  private readonly redis: ReturnType<typeof createClient> | null;
  private readonly localSessions = new Map<string, LocalLease>();
  private readonly localUsers = new Map<string, Map<string, number>>();
  private readonly localGlobal = new Map<string, number>();

  constructor(configService: ConfigService) {
    this.mode =
      configService.get<string>('agentAdmission.mode') === 'redis'
        ? 'redis'
        : 'local';
    this.redisUrl = configService.get<string>('agentAdmission.redisUrl');
    if (this.mode === 'redis') {
      if (!this.redisUrl) {
        throw new Error(
          'REDIS_URL is required when AGENT_ADMISSION_MODE=redis',
        );
      }
      this.redis = createClient({
        url: this.redisUrl,
        disableOfflineQueue: true,
        commandsQueueMaxLength: 1_000,
        socket: { connectTimeout: 5_000 },
      });
      this.redis.on('error', () => {
        this.logger.error('Redis admission store connection error');
      });
    } else {
      this.redis = null;
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.mode === 'local') {
      this.logger.warn(
        'Agent admission uses local mode; configure redis mode before running multiple API instances',
      );
      return;
    }
    try {
      await this.redisClient().connect();
    } catch {
      throw new Error(
        'Failed to connect to the Redis agent admission store; verify REDIS_URL without exposing credentials',
      );
    }
  }

  onModuleDestroy(): void {
    if (this.redis?.isOpen) this.redis.destroy();
  }

  async tryAcquire(
    input: AgentAdmissionStoreInput,
  ): Promise<AgentAdmissionStoreDecision> {
    if (this.mode === 'local') return this.tryAcquireLocal(input);
    const result = await this.evaluate(ACQUIRE_SCRIPT, {
      keys: this.keys(input.ownerId, input.sessionId),
      arguments: [
        String(input.leaseTtlMs),
        String(input.perUserLimit),
        String(input.globalLimit),
        input.runId,
      ],
    });
    return this.toDecision(Number(result));
  }

  async renew(input: {
    ownerId: string;
    sessionId: string;
    runId: string;
    nowMs: number;
    leaseTtlMs: number;
  }): Promise<boolean> {
    if (this.mode === 'local') return this.renewLocal(input);
    const result = await this.evaluate(RENEW_SCRIPT, {
      keys: this.keys(input.ownerId, input.sessionId),
      arguments: [input.runId, String(input.leaseTtlMs)],
    });
    return Number(result) === 1;
  }

  async release(input: {
    ownerId: string;
    sessionId: string;
    runId: string;
  }): Promise<void> {
    if (this.mode === 'local') {
      this.releaseLocal(input);
      return;
    }
    await this.evaluate(RELEASE_SCRIPT, {
      keys: this.keys(input.ownerId, input.sessionId),
      arguments: [input.runId],
    });
  }

  private tryAcquireLocal(
    input: AgentAdmissionStoreInput,
  ): AgentAdmissionStoreDecision {
    this.cleanupLocal(input.nowMs);
    const sessionKey = this.sessionKey(input.ownerId, input.sessionId);
    if (this.localSessions.has(sessionKey)) {
      return { accepted: false, reason: 'SESSION_BUSY' };
    }
    const userRuns =
      this.localUsers.get(input.ownerId) ?? new Map<string, number>();
    if (userRuns.size >= input.perUserLimit) {
      return { accepted: false, reason: 'USER_LIMIT' };
    }
    if (this.localGlobal.size >= input.globalLimit) {
      return { accepted: false, reason: 'GLOBAL_LIMIT' };
    }

    const expiresAt = input.nowMs + input.leaseTtlMs;
    this.localSessions.set(sessionKey, { runId: input.runId, expiresAt });
    userRuns.set(input.runId, expiresAt);
    this.localUsers.set(input.ownerId, userRuns);
    this.localGlobal.set(input.runId, expiresAt);
    return { accepted: true };
  }

  private renewLocal(input: {
    ownerId: string;
    sessionId: string;
    runId: string;
    nowMs: number;
    leaseTtlMs: number;
  }): boolean {
    this.cleanupLocal(input.nowMs);
    const sessionKey = this.sessionKey(input.ownerId, input.sessionId);
    const session = this.localSessions.get(sessionKey);
    if (!session || session.runId !== input.runId) return false;

    const expiresAt = input.nowMs + input.leaseTtlMs;
    session.expiresAt = expiresAt;
    this.localUsers.get(input.ownerId)?.set(input.runId, expiresAt);
    this.localGlobal.set(input.runId, expiresAt);
    return true;
  }

  private releaseLocal(input: {
    ownerId: string;
    sessionId: string;
    runId: string;
  }): void {
    const sessionKey = this.sessionKey(input.ownerId, input.sessionId);
    const session = this.localSessions.get(sessionKey);
    if (session?.runId === input.runId) this.localSessions.delete(sessionKey);
    const userRuns = this.localUsers.get(input.ownerId);
    userRuns?.delete(input.runId);
    if (userRuns?.size === 0) this.localUsers.delete(input.ownerId);
    this.localGlobal.delete(input.runId);
  }

  private cleanupLocal(nowMs: number): void {
    for (const [key, lease] of this.localSessions) {
      if (lease.expiresAt <= nowMs) this.localSessions.delete(key);
    }
    for (const [ownerId, runs] of this.localUsers) {
      for (const [runId, expiresAt] of runs) {
        if (expiresAt <= nowMs) runs.delete(runId);
      }
      if (runs.size === 0) this.localUsers.delete(ownerId);
    }
    for (const [runId, expiresAt] of this.localGlobal) {
      if (expiresAt <= nowMs) this.localGlobal.delete(runId);
    }
  }

  private toDecision(result: number): AgentAdmissionStoreDecision {
    if (result === 1) return { accepted: true };
    if (result === -1) return { accepted: false, reason: 'SESSION_BUSY' };
    if (result === -2) return { accepted: false, reason: 'USER_LIMIT' };
    if (result === -3) return { accepted: false, reason: 'GLOBAL_LIMIT' };
    throw new Error('Redis admission store returned an invalid decision');
  }

  private keys(ownerId: string, sessionId: string): [string, string, string] {
    const prefix = 'booksoul:{agent-admission}';
    return [
      `${prefix}:session:${ownerId}:${sessionId}`,
      `${prefix}:user:${ownerId}`,
      `${prefix}:global`,
    ];
  }

  private sessionKey(ownerId: string, sessionId: string): string {
    return `${ownerId}:${sessionId}`;
  }

  private redisClient(): ReturnType<typeof createClient> {
    if (!this.redis) throw new Error('Redis admission store is not configured');
    return this.redis;
  }

  private async evaluate(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown> {
    try {
      return await this.redisClient().eval(script, options);
    } catch {
      throw new Error('Agent admission store is unavailable');
    }
  }
}
