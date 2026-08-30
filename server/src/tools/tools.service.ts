import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
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
    if (dto.confirmed !== true) {
      throw new BadRequestException('必须明确确认后才能发送邮件');
    }

    const from =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!from || !user || !pass) {
      throw new ServiceUnavailableException('邮件服务尚未配置');
    }

    try {
      await this.mailerService.sendMail({
        to: dto.to.trim(),
        subject: dto.subject.trim(),
        text: dto.text,
        from,
      });
      this.logger.log('A user-confirmed email was sent');
    } catch {
      this.logger.error('A user-confirmed email delivery failed');
      throw new ServiceUnavailableException('邮件暂时无法发送，请稍后重试');
    }
  }
}
