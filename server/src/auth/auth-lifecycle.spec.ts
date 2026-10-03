import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthEmailVerificationService } from './auth-email-verification.service';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

// HTTP contracts/strategy are real. Account transactions and delivery are mocked here;
// PostgreSQL evidence belongs exclusively to the explicitly guarded DB suites.
describe('HTTP credential lifecycle', () => {
  let app: INestApplication<App>;
  let server: App;
  let jwt: JwtService;
  let version = 0;
  const user = {
    id: 'fixture',
    email: 'reader@example.invalid',
    name: 'Reader',
    emailVerifiedAt: null,
  };
  const secret = 'fixture-only-access-secret';
  const receipt = {
    verificationId: '66583af6-bf0e-432f-a38c-e6ca319fe82c',
    expiresInSeconds: 600,
    resendAfterSeconds: 60,
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AuthController],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'auth.accessSecret' ? secret : 7),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findAuthStateById: () =>
              Promise.resolve({ user, authVersion: version }),
          },
        },
        {
          provide: AuthEmailVerificationService,
          useValue: { requestRegistrationCode: () => Promise.resolve(receipt) },
        },
        {
          provide: AuthPasswordResetService,
          useValue: {
            resetPassword: () => {
              version++;
              return Promise.resolve();
            },
          },
        },
        {
          provide: AuthService,
          useValue: {
            login: async () => ({
              user,
              refreshToken: 'fixture-refresh',
              accessToken: await jwt.signAsync({
                sub: user.id,
                email: user.email,
                type: 'access',
                authVersion: version,
              }),
            }),
            refresh: () => {
              if (version) throw new UnauthorizedException();
              return Promise.resolve({
                user,
                refreshToken: 'fixture-refresh',
                accessToken: 'fixture-access',
              });
            },
          },
        },
      ],
    }).compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpServer();
  });
  afterAll(() => app.close());
  it('keeps legacy login available and makes reset invalidate a previously signed JWT', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'old-password' })
      .expect(200);
    const token = (login.body as { data: { accessToken: string } }).data
      .accessToken;
    expect(login.body.data).not.toHaveProperty('refreshToken');
    await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(server).get('/api/auth/reset-password').expect(404);
    expect(version).toBe(0);
    const reset = await request(server)
      .post('/api/auth/reset-password')
      .send({ token: 'A'.repeat(43), newPassword: 'new-password' })
      .expect(200);
    expect(reset.body.data).not.toHaveProperty('accessToken');
    expect(reset.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('booksoul_refresh=;')]),
    );
    await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', 'booksoul_refresh=fixture-refresh')
      .expect(401);
  });
  it('enforces IP limits independently of mailbox quota mocks', async () => {
    for (let i = 0; i < 10; i++)
      await request(server)
        .post('/api/auth/registration-code')
        .send({ email: user.email })
        .expect(202);
    await request(server)
      .post('/api/auth/registration-code')
      .send({ email: user.email })
      .expect(429);
  });
});
