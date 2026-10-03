import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { ToolsService } from './tools.service';
import { createTransport } from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';

describe('ToolsService email delivery', () => {
  const dto = {
    to: 'reader@example.com',
    subject: '  阅读笔记  ',
    text: '这是已确认的邮件正文。',
    confirmed: true as const,
  };
  let sendMail: jest.Mock<Promise<unknown>, [SendMailOptions]>;
  let config: Record<string, string | undefined>;
  let service: ToolsService;

  beforeEach(() => {
    sendMail = jest
      .fn<Promise<unknown>, [SendMailOptions]>()
      .mockResolvedValue(undefined);
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

  it('sends the confirmed draft with HTML and an unchanged plain-text alternative', async () => {
    await service.sendConfirmedEmail(dto);

    expect(sendMail).toHaveBeenCalledWith({
      to: 'reader@example.com',
      subject: '阅读笔记',
      text: '这是已确认的邮件正文。',
      from: 'BookSoul <sender@example.com>',
      html: expect.stringContaining('这是已确认的邮件正文。'),
      attachments: expect.any(Array),
    });
  });

  it('escapes user text and the subject rather than treating them as HTML', async () => {
    await service.sendConfirmedEmail({
      ...dto,
      subject: '<img src=x>',
      text: '<script>alert(1)</script>\n原文：A&B',
    });
    const mail = sendMail.mock.calls[0][0] as { html: string; text: string };
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail.html).toContain('原文：A&amp;B');
    expect(mail.html).toContain('&lt;img src=x&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img src=x>');
    expect(mail.text).toBe('<script>alert(1)</script>\n原文：A&B');
  });

  it('builds a multipart reading email locally without SMTP or external assets', async () => {
    await service.sendConfirmedEmail(dto);
    const transport = createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const result = await transport.sendMail(sendMail.mock.calls[0][0]);
    const mime = result.message.toString();
    expect(mime).toContain('Content-Type: multipart/alternative;');
    expect(mime).toContain('Content-Type: text/html; charset=utf-8');
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
    expect(String(sendMail.mock.calls[0][0].html)).not.toMatch(
      /<img[^>]+src="https?:/i,
    );
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
