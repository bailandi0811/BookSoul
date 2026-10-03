import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthChallengesService } from './auth-challenges.service';
import { assertNewPasswordPolicy, normalizeEmail } from './auth-input.policy';
import { AuthMailDispatcher } from './auth-mail-dispatcher.service';
import { AuthMailService } from './auth-mail.service';
import { lockAuthUser } from './auth-user-lock';
const invalidReset = () =>
  new BadRequestException({
    code: 'INVALID_RESET_TOKEN',
    message: '重置链接无效或已过期，请重新申请',
  });

@Injectable()
export class AuthPasswordResetService {
  private readonly logger = new Logger(AuthPasswordResetService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: AuthChallengesService,
    private readonly mail: AuthMailService,
    private readonly dispatcher: AuthMailDispatcher,
  ) {}
  async requestReset(
    emailInput: string,
  ): Promise<{ message: string; resendAfterSeconds: number }> {
    this.challenges.assertConfigured();
    this.mail.assertConfigured('reset');
    this.dispatcher.assertCapacity();
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    const prepared = await this.challenges.issue(
      { email, purpose: 'PASSWORD_RESET', userId: user?.id ?? null },
      () => new Date(),
    );
    try {
      this.dispatcher.enqueue(async () => {
        try {
          if (prepared.expiresAt <= new Date()) {
            await this.challenges.markDelivery(
              prepared.id,
              prepared.generation,
              'FAILED',
            );
            return;
          }
          if (!prepared.userId) {
            await this.challenges.markDelivery(
              prepared.id,
              prepared.generation,
              'SUPPRESSED',
            );
            return;
          }
          await this.mail.sendResetLink({ email, token: prepared.secret });
          await this.challenges.markDelivery(
            prepared.id,
            prepared.generation,
            'SENT',
          );
        } catch {
          this.logger.error('AUTH_MAIL_DELIVERY_FAILED');
          await this.challenges.markDelivery(
            prepared.id,
            prepared.generation,
            'FAILED',
          );
        }
      });
    } catch (error) {
      await this.challenges.markDelivery(
        prepared.id,
        prepared.generation,
        'FAILED',
      );
      throw error;
    }
    return {
      message: '如果该邮箱已注册，将收到重置邮件，请检查邮箱或稍后重试。',
      resendAfterSeconds: 60,
    };
  }
  async resetPassword(dto: {
    token: string;
    newPassword: string;
  }): Promise<void> {
    assertNewPasswordPolicy(dto.newPassword);
    const target = await this.challenges.findResetTarget(dto.token);
    if (!target) throw invalidReset();
    const passwordHash = await hash(dto.newPassword, 10);
    const success = await this.prisma.$transaction(async (tx) => {
      const user = await lockAuthUser(tx, target.userId);
      if (!user || user.email !== target.email) return false;
      const verified = await this.challenges.verify(
        tx,
        { ...target, secret: dto.token },
        () => new Date(),
      );
      if (verified.status === 'invalid') return false;
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (
        !(await this.challenges.consume(
          tx,
          verified.challenge,
          () => new Date(),
        ))
      )
        throw invalidReset();
      return true;
    });
    if (!success) throw invalidReset();
    // Notification failure cannot turn a committed password change into an error.
    try {
      this.dispatcher.enqueue(async () => {
        try {
          await this.mail.sendPasswordChanged({ email: target.email });
        } catch {
          this.logger.error('AUTH_PASSWORD_CHANGED_NOTICE_FAILED');
        }
      });
    } catch {
      this.logger.error('AUTH_PASSWORD_CHANGED_NOTICE_FAILED');
    }
  }
}
