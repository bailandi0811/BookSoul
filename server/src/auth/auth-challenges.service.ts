import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthChallenge, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertChallengeKey,
  digestOtp,
  digestResetToken,
  generateOtp,
  generateResetToken,
  matchesDigest,
} from './auth-challenge.crypto';
import {
  AuthClock,
  ChallengeProof,
  ChallengeTarget,
  ChallengeVerification,
  PreparedChallenge,
  ResetChallengeTarget,
  VerifiedChallenge,
} from './auth-challenge.types';

@Injectable()
export class AuthChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  assertConfigured(): void {
    this.challengeKey();
  }
  private challengeKey(): string {
    const key = this.config.get<string>('auth.challengeSecret');
    assertChallengeKey(key);
    if (key === this.config.get<string>('auth.accessSecret'))
      throw new ServiceUnavailableException('邮箱认证密钥必须独立配置');
    return key;
  }

  async issue(
    target: ChallengeTarget,
    clock: AuthClock,
  ): Promise<PreparedChallenge> {
    const key = this.challengeKey();
    return this.prisma.$transaction(async (tx) => {
      const id = randomUUID();
      const placeholder = digestResetToken(generateResetToken());
      // The unique pair and row lock make quotas shared across server processes.
      await tx.$executeRaw`INSERT INTO "AuthChallenge" ("id", "verificationId", "email", "purpose", "secretHash", "expiresAt", "resendAllowedAt", "windowStartedAt", "updatedAt")
        VALUES (${id}, ${randomUUID()}, ${target.email}, ${target.purpose}::"AuthChallengePurpose", ${placeholder}, ${new Date(0)}, ${new Date(0)}, ${new Date(0)}, CURRENT_TIMESTAMP)
        ON CONFLICT ("email", "purpose") DO NOTHING`;
      const [row] = await tx.$queryRaw<
        AuthChallenge[]
      >`SELECT * FROM "AuthChallenge" WHERE "email" = ${target.email} AND "purpose" = ${target.purpose}::"AuthChallengePurpose" FOR UPDATE`;
      if (!row) throw new ServiceUnavailableException('认证挑战暂时不可用');
      const now = clock();
      const newWindow =
        now.getTime() - row.windowStartedAt.getTime() >= 3_600_000;
      const until = Math.max(
        row.resendAllowedAt.getTime(),
        !newWindow && row.sendCount >= 5
          ? row.windowStartedAt.getTime() + 3_600_000
          : 0,
      );
      if (until > now.getTime())
        throw new HttpException(
          {
            statusCode: 429,
            message: '发送过于频繁，请稍后重试',
            code: 'AUTH_RATE_LIMITED',
            retryAfterSeconds: Math.ceil((until - now.getTime()) / 1000),
          },
          429,
        );
      const secret =
        target.purpose === 'PASSWORD_RESET'
          ? generateResetToken()
          : generateOtp();
      const generation = row.generation + 1;
      const verificationId = randomUUID();
      const expiresAt = new Date(
        now.getTime() +
          (target.purpose === 'PASSWORD_RESET' ? 1_800_000 : 600_000),
      );
      const resendAllowedAt = new Date(now.getTime() + 60_000);
      await tx.authChallenge.update({
        where: { id: row.id },
        data: {
          userId: target.userId,
          verificationId,
          generation,
          secretHash:
            target.purpose === 'PASSWORD_RESET'
              ? digestResetToken(secret)
              : digestOtp(key, { ...target, id: row.id, generation }, secret),
          expiresAt,
          resendAllowedAt,
          attempts: 0,
          consumedAt: null,
          deliveryState: 'PENDING',
          windowStartedAt: newWindow ? now : row.windowStartedAt,
          sendCount: newWindow ? 1 : row.sendCount + 1,
        },
      });
      return {
        ...target,
        id: row.id,
        verificationId,
        generation,
        secret,
        expiresAt,
        resendAllowedAt,
      };
    });
  }

  async verify(
    tx: Prisma.TransactionClient,
    proof: ChallengeProof,
    clock: AuthClock,
  ): Promise<ChallengeVerification> {
    const [row] = await tx.$queryRaw<
      AuthChallenge[]
    >`SELECT * FROM "AuthChallenge" WHERE "verificationId" = ${proof.verificationId} AND "email" = ${proof.email} AND "purpose" = ${proof.purpose}::"AuthChallengePurpose" AND "userId" IS NOT DISTINCT FROM ${proof.userId}::text FOR UPDATE`;
    const now = clock();
    // Explicit checks also protect this boundary when DB adapters are mocked.
    if (
      !row ||
      row.verificationId !== proof.verificationId ||
      row.email !== proof.email ||
      row.purpose !== proof.purpose ||
      row.userId !== proof.userId ||
      row.deliveryState !== 'SENT' ||
      row.consumedAt ||
      row.expiresAt <= now ||
      row.attempts >= 5
    )
      return { status: 'invalid' };
    const digest =
      proof.purpose === 'PASSWORD_RESET'
        ? digestResetToken(proof.secret)
        : digestOtp(this.challengeKey(), row, proof.secret);
    if (!matchesDigest(row.secretHash, digest)) {
      await tx.authChallenge.update({
        where: { id: row.id },
        data: { attempts: row.attempts + 1 },
      });
      // Return, rather than throw: the caller must commit failed attempts.
      return { status: 'invalid' };
    }
    return {
      status: 'valid',
      challenge: {
        email: row.email,
        purpose: row.purpose,
        userId: row.userId,
        id: row.id,
        generation: row.generation,
      },
    };
  }

  async consume(
    tx: Prisma.TransactionClient,
    challenge: VerifiedChallenge,
    clock: AuthClock,
  ): Promise<boolean> {
    const now = clock();
    const result = await tx.authChallenge.updateMany({
      where: {
        id: challenge.id,
        generation: challenge.generation,
        email: challenge.email,
        purpose: challenge.purpose,
        userId: challenge.userId,
        deliveryState: 'SENT',
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: 5 },
      },
      data: { consumedAt: now },
    });
    return result.count === 1;
  }

  async findResetTarget(secret: string): Promise<ResetChallengeTarget | null> {
    if (
      !/^[\w-]{43}$/.test(secret) ||
      Buffer.from(secret, 'base64url').toString('base64url') !== secret
    )
      return null;
    const row = await this.prisma.authChallenge.findFirst({
      where: {
        secretHash: digestResetToken(secret),
        purpose: 'PASSWORD_RESET',
        userId: { not: null },
      },
      select: { id: true, verificationId: true, email: true, userId: true },
    });
    return row?.userId
      ? { ...row, userId: row.userId, purpose: 'PASSWORD_RESET' }
      : null;
  }

  async markDelivery(
    id: string,
    generation: number,
    state: 'SENT' | 'FAILED' | 'SUPPRESSED',
  ): Promise<void> {
    await this.prisma.authChallenge.updateMany({
      where: { id, generation, deliveryState: 'PENDING' },
      data: { deliveryState: state },
    });
  }
}
