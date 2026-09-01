import type { AgentRunStatus } from '@prisma/client';

export type AgentAdmissionRejectionReason =
  | 'SESSION_BUSY'
  | 'USER_LIMIT'
  | 'GLOBAL_LIMIT';

export interface AgentAdmissionScope {
  ownerId: string;
  sessionId: string;
  bookId: string;
}

export interface AgentAdmissionStoreInput extends AgentAdmissionScope {
  runId: string;
  nowMs: number;
  leaseTtlMs: number;
  perUserLimit: number;
  globalLimit: number;
}

export type AgentAdmissionStoreDecision =
  | { accepted: true }
  | { accepted: false; reason: AgentAdmissionRejectionReason };

export type AgentRunFinalStatus = Extract<
  AgentRunStatus,
  'SUCCEEDED' | 'CANCELLED' | 'FAILED' | 'LEASE_LOST'
>;
