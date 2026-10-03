import { MailerService } from '@nestjs-modules/mailer';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AuthMailService } from './auth-mail.service';
import {
  authAcceptanceModule,
  configureAuthAcceptanceApp,
  resolveAuthAcceptanceSettings,
} from '../../test/support/auth-acceptance';

const environment = {
  DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/booksoul?schema=public',
  TEST_DATABASE_URL:
    'postgresql://fixture:fixture@127.0.0.1:5432/booksoul_test?schema=test_auth&connection_limit=5',
  AUTH_CHALLENGE_SECRET: 'ab'.repeat(32),
  AUTH_PUBLIC_BASE_URL: 'http://localhost:5173',
  AUTH_ACCEPTANCE_RECIPIENT: 'controlled@example.invalid',
  AUTH_ACCEPTANCE_SEND_MAIL: 'yes',
};

describe('manual authentication acceptance preflight', () => {
  it('resolves the explicit isolated target and controlled recipient', () => {
    const settings = resolveAuthAcceptanceSettings({
      ...environment,
      AUTH_ACCEPTANCE_RECIPIENT: ' Controlled@Example.Invalid ',
    });
    expect(settings.databaseUrl).toBe(environment.TEST_DATABASE_URL);
    expect(settings.recipient).toBe('controlled@example.invalid');
    expect(settings.origin).toBe('http://localhost:5173');
  });

  it.each([
    { DATABASE_URL: undefined },
    { TEST_DATABASE_URL: undefined },
    { TEST_DATABASE_URL: environment.DATABASE_URL },
    {
      TEST_DATABASE_URL:
        'postgresql://fixture:fixture@other.invalid:5432/booksoul_test?schema=test_auth',
    },
  ])('rejects missing, shared or unexpected targets before startup: %p', (input) => {
    expect(() =>
      resolveAuthAcceptanceSettings({ ...environment, ...input }),
    ).toThrow();
  });

  it.each([
    { AUTH_ACCEPTANCE_RECIPIENT: '' },
    { AUTH_ACCEPTANCE_RECIPIENT: 'invalid-address' },
    { AUTH_ACCEPTANCE_SEND_MAIL: undefined },
    { AUTH_CHALLENGE_SECRET: '' },
    { AUTH_PUBLIC_BASE_URL: 'https://external.invalid' },
  ])('rejects incomplete mail consent or local configuration: %p', (input) => {
    expect(() =>
      resolveAuthAcceptanceSettings({ ...environment, ...input }),
    ).toThrow();
  });
});

describe('manual acceptance reuses auth with mocked external services', () => {
  let app: INestApplication;
  let previousEnvironment: NodeJS.ProcessEnv;
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'fixture' });

  beforeAll(async () => {
    previousEnvironment = { ...process.env };
    Object.assign(process.env, environment, {
      DATABASE_URL: environment.TEST_DATABASE_URL,
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'fixture-jwt-secret-distinct-from-challenge',
      SMTP_USER: 'fixture-sender',
      SMTP_PASS: 'fixture-pass',
      SMTP_FROM: 'sender@example.invalid',
    });
    const module = await Test.createTestingModule({
      imports: [authAcceptanceModule()],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(MailerService)
      .useValue({ sendMail })
      .compile();
    app = module.createNestApplication();
    configureAuthAcceptanceApp(app, resolveAuthAcceptanceSettings(environment));
    await app.init();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in previousEnvironment)) delete process.env[key];
      }
      Object.assign(process.env, previousEnvironment);
    }
  });

  it('keeps real authentication and DTO rejection without book modules', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).get('/api/auth/me').expect(401);
    await request(server)
      .post('/api/auth/registration-code')
      .send({ email: environment.AUTH_ACCEPTANCE_RECIPIENT, userId: 'untrusted' })
      .expect(400);
    await request(server).get('/api/books').expect(404);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('allows the controlled address through the real fixed-template mail service', async () => {
    await app.get(AuthMailService).sendOtp({
      email: environment.AUTH_ACCEPTANCE_RECIPIENT,
      code: '000123',
      purpose: 'REGISTRATION',
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: environment.AUTH_ACCEPTANCE_RECIPIENT,
      subject: '书魂邮箱验证码',
    });
  });

  it('refuses a different recipient before invoking the SMTP adapter', async () => {
    await expect(
      app.get(AuthMailService).sendOtp({
        email: 'other@example.invalid',
        code: '000123',
        purpose: 'REGISTRATION',
      }),
    ).rejects.toThrow('认证邮件发送失败');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it.each([
    { to: environment.AUTH_ACCEPTANCE_RECIPIENT, cc: 'other@example.invalid' },
    { to: environment.AUTH_ACCEPTANCE_RECIPIENT, bcc: 'other@example.invalid' },
    { to: [environment.AUTH_ACCEPTANCE_RECIPIENT, 'other@example.invalid'] },
  ])('refuses additional recipients before the SMTP adapter: %p', (options) => {
    expect(() => app.get(MailerService).sendMail(options)).toThrow(
      '验收入口只允许向指定受控邮箱单独发信',
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
