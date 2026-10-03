import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trustedAuthPublicUrl } from '../config/auth-mail.config';
import { assertChallengeKey } from './auth-challenge.crypto';
import { OtpPurpose } from './auth-challenge.types';
import {
  AuthMailContent,
  buildOtpMail,
  buildPasswordChangedMail,
  buildResetMail,
} from './auth-mail.templates';
@Injectable()
export class AuthMailService {
  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}
  assertConfigured(kind: 'otp' | 'reset'): void {
    if (
      !['SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].every((key) =>
        this.config.get<string>(key)?.trim(),
      )
    )
      throw new ServiceUnavailableException('认证邮件尚未配置');
    assertChallengeKey(this.config.get<string>('auth.challengeSecret'));
    if (kind === 'reset') this.baseUrl();
  }
  private baseUrl(): URL {
    try {
      return trustedAuthPublicUrl(
        this.config.get<string>('auth.publicBaseUrl'),
        this.config.get<string>('NODE_ENV') === 'production',
      );
    } catch {
      throw new ServiceUnavailableException('密码重置地址尚未配置');
    }
  }
  buildResetUrl(token: string): string {
    const url = this.baseUrl();
    url.hash = 'reset-password?' + new URLSearchParams({ token }).toString();
    return url.toString();
  }
  async sendOtp(input: {
    email: string;
    code: string;
    purpose: OtpPurpose;
  }): Promise<void> {
    this.assertConfigured('otp');
    await this.send(input.email, buildOtpMail(input.code, input.purpose));
  }
  async sendResetLink(input: { email: string; token: string }): Promise<void> {
    this.assertConfigured('reset');
    await this.send(
      input.email,
      buildResetMail(this.buildResetUrl(input.token)),
    );
  }
  async sendPasswordChanged(input: { email: string }): Promise<void> {
    this.assertConfigured('otp');
    await this.send(input.email, buildPasswordChangedMail());
  }
  private async send(email: string, content: AuthMailContent): Promise<void> {
    try {
      await this.mailer.sendMail({
        from: this.config.get<string>('SMTP_FROM'),
        to: email,
        ...content,
      });
    } catch {
      throw new ServiceUnavailableException('认证邮件发送失败');
    }
  }
}
