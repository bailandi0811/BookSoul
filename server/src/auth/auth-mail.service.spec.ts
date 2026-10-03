import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { createTransport, type SendMailOptions } from 'nodemailer';
import { AuthMailService } from './auth-mail.service';
describe('authentication mail', () => {
  let values: Record<string, string>;
  const sendMail = jest.fn<Promise<unknown>, [SendMailOptions]>();
  let service: AuthMailService;
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({});
    values = {
      SMTP_USER: 'fixture',
      SMTP_PASS: 'fixture',
      SMTP_FROM: 'BookSoul <noreply@example.invalid>',
      'auth.challengeSecret': 'ab'.repeat(32),
      'auth.publicBaseUrl': 'https://booksoul.example/app/',
    };
    service = new AuthMailService(
      { sendMail } as unknown as MailerService,
      { get: (key: string) => values[key] } as unknown as ConfigService,
    );
  });
  it('keeps trusted reset links and plain text alongside the HTML messages', async () => {
    const token = Buffer.alloc(32, 1).toString('base64url');
    expect(service.buildResetUrl(token)).toBe(
      'https://booksoul.example/app/#reset-password?token=' + token,
    );
    await service.sendResetLink({ email: 'reader@example.invalid', token });
    expect(sendMail.mock.calls[0][0].text).toContain('30 分钟');
    expect(sendMail.mock.calls[0][0].html).toEqual(
      expect.stringContaining(
        'href="https://booksoul.example/app/#reset-password?token=' +
          token +
          '"',
      ),
    );
    await service.sendOtp({
      email: 'reader@example.invalid',
      code: '000123',
      purpose: 'REGISTRATION',
    });
    expect(sendMail.mock.calls[1][0].text).toContain('000123');
    expect(sendMail.mock.calls[1][0].text).toContain('10 分钟');
    expect(sendMail.mock.calls[1][0].subject).not.toContain('000123');
    expect(sendMail.mock.calls[1][0].html).toEqual(
      expect.stringContaining('000123'),
    );
    await service.sendPasswordChanged({ email: 'reader@example.invalid' });
    expect(sendMail.mock.calls[2][0].text).not.toContain(token);
    expect(sendMail.mock.calls[2][0].html).toEqual(
      expect.stringContaining('密码已修改'),
    );
    expect(sendMail.mock.calls[2][0].html).not.toContain(token);
  });
  it.each(['REGISTRATION', 'EMAIL_VERIFICATION'] as const)(
    'keeps the full OTP readable with an embedded PNG logo for %s',
    async (purpose) => {
      await service.sendOtp({
        email: 'reader@example.invalid',
        code: '000123',
        purpose,
      });
      const message = sendMail.mock.calls[0][0];
      expect(message.html).toEqual(expect.stringContaining('000123'));
      expect(message.html).toEqual(expect.stringContaining('10 分钟'));
      expect(message.html).not.toMatch(/<img[^>]+src="https?:/i);
      const cid = String(message.html).match(/src="cid:([^"]+)"/)?.[1];
      expect(cid).toBeDefined();
      const logo = message.attachments?.find((image) => image.cid === cid);
      expect(logo?.contentType).toBe('image/png');
      expect(logo?.contentDisposition).toBe('inline');
      expect(Buffer.isBuffer(logo?.content)).toBe(true);
      expect((logo?.content as Buffer).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    },
  );
  it('escapes dynamic text without turning it into email markup', async () => {
    await service.sendOtp({
      email: 'reader@example.invalid',
      code: '<img src=x onerror="alert(1)">&',
      purpose: 'REGISTRATION',
    });
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toEqual(
      expect.stringContaining(
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;',
      ),
    );
    expect(html).not.toContain('<img src=x');
  });
  it('escapes trusted deployment paths in both link attributes and visible links', async () => {
    values['auth.publicBaseUrl'] = "https://booksoul.example/reader'&/";
    await service.sendResetLink({
      email: 'reader@example.invalid',
      token: 'fixture-token',
    });
    const message = sendMail.mock.calls[0][0];
    expect(message.text).toContain(
      "https://booksoul.example/reader'&/#reset-password?token=fixture-token",
    );
    expect(message.html).toEqual(
      expect.stringContaining(
        'href="https://booksoul.example/reader&#39;&amp;/#reset-password?token=fixture-token"',
      ),
    );
    expect(message.html).not.toContain("reader'&/");
  });
  it('composes HTML, a plain-text alternative and a related inline logo without SMTP', async () => {
    await service.sendPasswordChanged({ email: 'reader@example.invalid' });
    const transport = createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const result = await transport.sendMail(sendMail.mock.calls[0][0]);
    const mime = result.message.toString();
    expect(mime).toContain('Content-Type: multipart/alternative;');
    expect(mime).toContain('Content-Type: multipart/related;');
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
    expect(mime).toContain('Content-Type: text/html; charset=utf-8');
    expect(mime).toContain('Content-Type: image/png;');
    expect(mime).toContain('Content-Disposition: inline;');
  });
  it.each([
    'javascript:alert(1)',
    'http://external.example',
    'https://user:pass@example.com',
    'https://example.com/?x=1',
    'https://example.com/#x',
    '',
  ])('rejects untrusted base %s', (url) => {
    values['auth.publicBaseUrl'] = url;
    expect(() => service.buildResetUrl('token')).toThrow();
  });
  it('rejects missing configuration and sanitizes transport errors', async () => {
    delete values.SMTP_PASS;
    expect(() => service.assertConfigured('otp')).toThrow();
    expect(sendMail).not.toHaveBeenCalled();
    values.SMTP_PASS = 'fixture';
    sendMail.mockRejectedValue(new Error('secret SMTP failure'));
    await expect(
      service.sendPasswordChanged({ email: 'reader@example.invalid' }),
    ).rejects.toMatchObject({ message: '认证邮件发送失败' });
  });
});
