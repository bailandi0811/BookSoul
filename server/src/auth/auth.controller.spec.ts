import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('AuthController', () => {
  const secret = 'controller-test-access-secret';
  const publicUser = {
    id: 'user-1',
    email: 'reader@example.com',
    name: 'Reader',
  };
  const authData = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: publicUser,
  };
  const publicAuthData = {
    accessToken: authData.accessToken,
    user: publicUser,
  };

  let app: INestApplication<App>;
  let httpServer: App;
  let jwtService: JwtService;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    logoutAll: jest.Mock;
  };
  let usersService: {
    findPublicById: jest.Mock;
  };

  beforeAll(async () => {
    authService = {
      register: jest.fn().mockResolvedValue(authData),
      login: jest.fn().mockResolvedValue(authData),
      refresh: jest.fn().mockResolvedValue(authData),
      logout: jest.fn().mockResolvedValue(undefined),
      logoutAll: jest.fn().mockResolvedValue(undefined),
    };
    usersService = {
      findPublicById: jest.fn().mockResolvedValue(publicUser),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      controllers: [AuthController],
      providers: [
        JwtStrategy,
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'auth.accessSecret') return secret;
              if (key === 'auth.refreshExpiresDays') return 7;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    httpServer = app.getHttpServer();
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authService.register.mockResolvedValue(authData);
    authService.login.mockResolvedValue(authData);
    authService.refresh.mockResolvedValue(authData);
    authService.logout.mockResolvedValue(undefined);
    authService.logoutAll.mockResolvedValue(undefined);
    usersService.findPublicById.mockResolvedValue(publicUser);
  });

  it('normalizes a valid registration and returns the response envelope', async () => {
    const response = await request(httpServer)
      .post('/api/auth/register')
      .send({
        email: '  Reader@Example.COM ',
        password: 'password123',
        name: ' Reader ',
      })
      .expect(201)
      .expect({
        success: true,
        data: publicAuthData,
      });

    expect(response.headers['set-cookie']?.[0]).toContain(
      'booksoul_refresh=refresh-token',
    );
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Lax');

    expect(authService.register).toHaveBeenCalledWith({
      email: 'reader@example.com',
      password: 'password123',
      name: 'Reader',
    });
  });

  it('rejects invalid and unexpected registration fields', async () => {
    await request(httpServer)
      .post('/api/auth/register')
      .send({
        email: 'not-an-email',
        password: 'short',
        name: '',
        admin: true,
      })
      .expect(400);

    expect(authService.register).not.toHaveBeenCalled();
  });

  it('returns the current user for a valid access token', async () => {
    const accessToken = await jwtService.signAsync(
      {
        sub: publicUser.id,
        email: publicUser.email,
        type: 'access',
      },
      { algorithm: 'HS256', expiresIn: '15m' },
    );

    await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({
        success: true,
        data: {
          user: publicUser,
        },
      });
    expect(usersService.findPublicById).toHaveBeenCalledWith(publicUser.id);
  });

  it('refreshes tokens through the response envelope', async () => {
    const refreshToken = 'r'.repeat(43);

    await request(httpServer)
      .post('/api/auth/refresh')
      .set('Cookie', `booksoul_refresh=${refreshToken}`)
      .expect(200)
      .expect({
        success: true,
        data: publicAuthData,
      });

    expect(authService.refresh).toHaveBeenCalledWith(refreshToken);
  });

  it('rejects refresh without the HttpOnly cookie', async () => {
    await request(httpServer)
      .post('/api/auth/refresh')
      .expect(401);

    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('logs out the current refresh-token session idempotently', async () => {
    const refreshToken = 'r'.repeat(43);

    await request(httpServer)
      .post('/api/auth/logout')
      .set('Cookie', `booksoul_refresh=${refreshToken}`)
      .expect(200)
      .expect({ success: true, data: {} });

    expect(authService.logout).toHaveBeenCalledWith(refreshToken);
  });

  it('logs out all sessions for the access-token user', async () => {
    const accessToken = await jwtService.signAsync(
      {
        sub: publicUser.id,
        email: publicUser.email,
        type: 'access',
      },
      { algorithm: 'HS256', expiresIn: '15m' },
    );

    await request(httpServer)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ success: true, data: {} });

    expect(authService.logoutAll).toHaveBeenCalledWith(publicUser.id);
  });

  it('requires an access token for logout-all', async () => {
    await request(httpServer).post('/api/auth/logout-all').expect(401);
    expect(authService.logoutAll).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', undefined],
    [
      'a forged token',
      () =>
        jwtService.signAsync(
          {
            sub: publicUser.id,
            email: publicUser.email,
            type: 'access',
          },
          { secret: 'wrong-secret', algorithm: 'HS256', expiresIn: '15m' },
        ),
    ],
    [
      'an expired token',
      () =>
        jwtService.signAsync(
          {
            sub: publicUser.id,
            email: publicUser.email,
            type: 'access',
          },
          { algorithm: 'HS256', expiresIn: -1 },
        ),
    ],
    [
      'a token with the wrong type',
      () =>
        jwtService.signAsync(
          {
            sub: publicUser.id,
            email: publicUser.email,
            type: 'refresh',
          },
          { algorithm: 'HS256', expiresIn: '15m' },
        ),
    ],
    ['an opaque refresh token', () => Promise.resolve('r'.repeat(43))],
  ])('rejects %s', async (_case, createToken) => {
    const call = request(httpServer).get('/api/auth/me');
    const token =
      typeof createToken === 'function' ? await createToken() : undefined;

    if (token) {
      call.set('Authorization', `Bearer ${token}`);
    }

    await call.expect(401);
  });
});
