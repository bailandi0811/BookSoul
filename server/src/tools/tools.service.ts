import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  getSendMailTool() {
    const sendMailArgsSchema = z.object({
      to: z.string().email().describe('收件人邮箱地址，例如: test@example.com'),
      subject: z.string().describe('邮件主题'),
      text: z.string().describe('纯文本内容，可选').optional(),
      html: z.string().describe('HTML 内容，可选').optional(),
    });

    return tool(
      async ({ to, subject, text, html }: { to: string; subject: string; text?: string; html?: string }) => {
        try {
          const fallbackFrom = this.configService.get<string>('SMTP_FROM') || this.configService.get<string>('SMTP_USER');
          await this.mailerService.sendMail({
            to,
            subject,
            text: text ?? '(来自 BookSoul Agent 的邮件)',
            html: html ?? `<p>${text ?? '(来自 BookSoul Agent 的邮件)'}</p>`,
            from: fallbackFrom,
          });
          this.logger.log(`Email sent successfully to ${to}`);
          return `邮箱发送成功，收件人: ${to}, 主题: ${subject}`;
        } catch (error: any) {
          this.logger.error(`Failed to send email: ${error.message}`);
          return `发送邮件失败: ${error.message}`;
        }
      },
      {
        name: 'send_mail',
        description: '发送电子邮件。当用户要求给某个邮箱发送内容、文章片段、聊天记录或通知时调用。需要提供收件人邮箱地址、主题、文本内容。',
        schema: sendMailArgsSchema,
      },
    );
  }
}
