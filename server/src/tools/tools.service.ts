import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { SendEmailDto } from './dto/send-email.dto';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendConfirmedEmail(dto: SendEmailDto): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER');

    if (!from) {
      throw new ServiceUnavailableException('邮件服务尚未配置');
    }

    try {
      await this.mailerService.sendMail({
        to: dto.to,
        subject: dto.subject.trim(),
        text: dto.text,
        from,
      });
      this.logger.log('A user-confirmed email was sent');
    } catch (error) {
      this.logger.error('Failed to send a user-confirmed email', error);
      throw new ServiceUnavailableException('邮件暂时无法发送，请稍后重试');
    }
  }
}
