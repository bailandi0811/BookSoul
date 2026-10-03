import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, toPublicUser } from '../users/users.service';
import { ChallengeReceipt, ChallengeTarget } from './auth-challenge.types';
import { AuthChallengesService } from './auth-challenges.service';
import { normalizeEmail } from './auth-input.policy';
import { AuthMailDispatcher } from './auth-mail-dispatcher.service';
import { AuthMailService } from './auth-mail.service';
import { lockAuthUser } from './auth-user-lock';

export function invalidVerificationCode(): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_VERIFICATION_CODE',
    message: '验证码无效或已过期，请重新申请',
  });
}

@Injectable()
export class AuthEmailVerificationService {
  private readonly logger = new Logger(AuthEmailVerificationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: AuthChallengesService,
    private readonly mail: AuthMailService,
    private readonly dispatcher: AuthMailDispatcher,
  ) {}
  requestRegistrationCode(email: string): Promise<ChallengeReceipt> {
    return this.request({
      email: normalizeEmail(email),
      purpose: 'REGISTRATION',
      userId: null,
    });
  }
  async requestCurrentUserCode(userId: string): Promise<ChallengeReceipt> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.emailVerifiedAt)
      throw new ConflictException({
        code: 'EMAIL_ALREADY_VERIFIED',
        message: '邮箱已验证',
      });
    return this.request({
      email: user.email,
      purpose: 'EMAIL_VERIFICATION',
      userId,
    });
  }
  private async request(target: ChallengeTarget): Promise<ChallengeReceipt> {
    this.challenges.assertConfigured();
    this.mail.assertConfigured('otp');
    this.dispatcher.assertCapacity();
    const prepared = await this.challenges.issue(target, () => new Date());
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
          await this.mail.sendOtp({
            email: prepared.email,
            code: prepared.secret,
            purpose: prepared.purpose as 'REGISTRATION' | 'EMAIL_VERIFICATION',
          });
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
      verificationId: prepared.verificationId,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    };
  }
  async confirmCurrentUserEmail(
    userId: string,
    dto: { verificationId: string; code: string },
  ): Promise<PublicUser> {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await lockAuthUser(tx, userId);
      if (!user) return null;
      const verified = await this.challenges.verify(
        tx,
        {
          email: user.email,
          purpose: 'EMAIL_VERIFICATION',
          userId,
          verificationId: dto.verificationId,
          secret: dto.code,
        },
        () => new Date(),
      );
      if (verified.status === 'invalid') return null;
      if (
        !(await this.challenges.consume(
          tx,
          verified.challenge,
          () => new Date(),
        ))
      )
        throw invalidVerificationCode();
      return tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
    });
    if (!result) throw invalidVerificationCode();
    return toPublicUser(result);
  }
}
