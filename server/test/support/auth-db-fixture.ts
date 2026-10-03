import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resolveIsolatedDatabaseUrl } from '../../src/prisma/testing/isolated-database';
import { UsersService } from '../../src/users/users.service';
import { AuthChallengesService } from '../../src/auth/auth-challenges.service';
import { AuthEmailVerificationService } from '../../src/auth/auth-email-verification.service';
import { AuthMailDispatcher } from '../../src/auth/auth-mail-dispatcher.service';
import { AuthMailService } from '../../src/auth/auth-mail.service';
import { AuthPasswordResetService } from '../../src/auth/auth-password-reset.service';
import { AuthService } from '../../src/auth/auth.service';
import { JwtStrategy } from '../../src/auth/jwt.strategy';

export function authDbFixture() {
  const url = resolveIsolatedDatabaseUrl(process.env);
  const limit = new URL(url).searchParams.get('connection_limit');
  if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 2))
    throw new Error(
      'Auth race tests require at least two database connections',
    );
  const db = new PrismaClient({
    datasources: { db: { url } },
    transactionOptions: { maxWait: 10_000, timeout: 10_000 },
  });
  const userIds: string[] = [];
  const emails: string[] = [];
  const config = new ConfigService({
    auth: {
      accessSecret: 'fixture-jwt-secret-distinct-from-challenge',
      challengeSecret: 'ab'.repeat(32),
      accessExpires: '15m',
      refreshExpiresDays: 7,
    },
  });
  const mail = {
    assertConfigured: jest.fn(),
    sendPasswordChanged: jest.fn(),
  } as unknown as AuthMailService;
  const dispatcher = {
    enqueue: jest.fn(),
    assertCapacity: jest.fn(),
  } as unknown as AuthMailDispatcher;
  const prisma = db as unknown as PrismaService;
  const challenges = new AuthChallengesService(prisma, config);
  const users = new UsersService(prisma);
  const jwt = new JwtService();
  const reset = new AuthPasswordResetService(
    prisma,
    challenges,
    mail,
    dispatcher,
  );
  const verification = new AuthEmailVerificationService(
    prisma,
    challenges,
    mail,
    dispatcher,
  );
  const auth = new AuthService(users, prisma, jwt, config, challenges);

  function heldPrisma(
    when: 'before' | 'after',
    hook: () => Promise<void>,
  ): PrismaService {
    return {
      user: db.user,
      refreshToken: db.refreshToken,
      authChallenge: db.authChallenge,
      $transaction: <T>(
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
      ) =>
        db.$transaction(async (tx) => {
          let first = true;
          const query = async <R>(
            input: TemplateStringsArray | Prisma.Sql,
            ...values: unknown[]
          ): Promise<R> => {
            const hold = first;
            first = false;
            if (hold && when === 'before') await hook();
            const result = await tx.$queryRaw<R>(input, ...values);
            if (hold && when === 'after') await hook();
            return result;
          };
          const wrapped = new Proxy(tx, {
            get: (target, key) =>
              key === '$queryRaw'
                ? query
                : (Reflect.get(target, key) as unknown),
          });
          return callback(wrapped);
        }),
    } as unknown as PrismaService;
  }
  return {
    db,
    config,
    challenges,
    auth,
    reset,
    verification,
    jwt,
    strategy: new JwtStrategy(config, users),
    heldAuth: (when: 'before' | 'after', hook: () => Promise<void>) =>
      new AuthService(users, heldPrisma(when, hook), jwt, config, challenges),
    heldReset: (
      hook: () => Promise<void>,
      when: 'before' | 'after' = 'after',
    ) =>
      new AuthPasswordResetService(
        heldPrisma(when, hook),
        challenges,
        mail,
        dispatcher,
      ),
    async user() {
      const email = `auth-${randomUUID()}@example.invalid`;
      emails.push(email);
      const user = await db.user.create({
        data: {
          email,
          name: 'Auth fixture',
          passwordHash: await hash('old-password', 10),
        },
      });
      userIds.push(user.id);
      return user;
    },
    async resetProof(user: { email: string; id: string }) {
      const prepared = await challenges.issue(
        { email: user.email, purpose: 'PASSWORD_RESET', userId: user.id },
        () => new Date(),
      );
      await challenges.markDelivery(prepared.id, prepared.generation, 'SENT');
      return prepared;
    },
    async cleanup() {
      try {
        if (emails.length)
          await db.authChallenge.deleteMany({
            where: { email: { in: emails } },
          });
        if (userIds.length) {
          await db.chatSessionRecord.deleteMany({
            where: { ownerId: { in: userIds } },
          });
          await db.memoryRecord.deleteMany({
            where: { ownerId: { in: userIds } },
          });
          await db.user.deleteMany({
            where: { id: { in: userIds }, email: { in: emails } },
          });
        }
      } finally {
        await db.$disconnect();
      }
    },
  };
}

export function barrier() {
  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release,
    hook: async () => {
      entered();
      await proceed;
    },
    wait: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          reached,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error('Test lock barrier was not reached')),
              5_000,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
