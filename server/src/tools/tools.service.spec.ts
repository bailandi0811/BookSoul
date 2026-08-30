import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { ToolsService } from './tools.service';

describe('ToolsService email delivery', () => {
  const dto = {
    to: 'reader@example.com',
    subject: '  阅读笔记  ',
    text: '这是已确认的邮件正文。',
    confirmed: true as const,
  };
  let sendMail: jest.Mock;
  let config: Record<string, string | undefined>;
  let service: ToolsService;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue(undefined);
    config = {
      SMTP_FROM: 'BookSoul <sender@example.com>',
      SMTP_USER: 'sender@example.com',
      SMTP_PASS: 'smtp-secret',
    };
    service = new ToolsService(
      { sendMail } as unknown as MailerService,
      {
        get: jest.fn((name: string) => config[name]),
      } as unknown as ConfigService,
    );
  });

  it('sends only the explicitly confirmed plain-text draft', async () => {
    await service.sendConfirmedEmail(dto);

    expect(sendMail).toHaveBeenCalledWith({
      to: 'reader@example.com',
      subject: '阅读笔记',
      text: '这是已确认的邮件正文。',
      from: 'BookSoul <sender@example.com>',
    });
  });

  it('rejects calls that did not carry explicit confirmation', async () => {
    await expect(
      service.sendConfirmedEmail({
        ...dto,
        confirmed: false,
      } as unknown as typeof dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('fails closed when SMTP credentials are incomplete', async () => {
    config.SMTP_PASS = undefined;

    await expect(service.sendConfirmedEmail(dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not expose provider errors to the caller', async () => {
    sendMail.mockRejectedValue(new Error('provider secret response'));

    await expect(service.sendConfirmedEmail(dto)).rejects.toMatchObject({
      message: '邮件暂时无法发送，请稍后重试',
    });
  });
});
