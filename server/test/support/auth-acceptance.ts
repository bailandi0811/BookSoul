import { MailerService } from '@nestjs-modules/mailer';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { isEmail } from 'class-validator';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { assertChallengeKey } from '../../src/auth/auth-challenge.crypto';
import { AuthModule } from '../../src/auth/auth.module';
import { trustedAuthPublicUrl } from '../../src/config/auth-mail.config';
import configuration from '../../src/config/configuration';
import { validateEnvironment } from '../../src/config/env.validation';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { resolveIsolatedDatabaseUrl } from '../../src/prisma/testing/isolated-database';

export interface AuthAcceptanceSettings {
  databaseUrl: string;
  recipient: string;
  origin: string;
}

export function resolveAuthAcceptanceSettings(
  env: NodeJS.ProcessEnv,
): AuthAcceptanceSettings {
  const databaseUrl = resolveIsolatedDatabaseUrl(env);
  const target = new URL(databaseUrl);
  if (
    target.hostname !== '127.0.0.1' ||
    (target.port || '5432') !== '5432' ||
    target.pathname !== '/booksoul_test' ||
    target.searchParams.get('schema') !== 'test_auth'
  )
    throw new Error('验收入口只接受已确认的本机 booksoul_test / test_auth');

  assertChallengeKey(env.AUTH_CHALLENGE_SECRET);
  const publicUrl = trustedAuthPublicUrl(env.AUTH_PUBLIC_BASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname))
    throw new Error('验收入口只接受本机前端地址');

  const recipient = env.AUTH_ACCEPTANCE_RECIPIENT?.trim().toLowerCase() ?? '';
  if (recipient.length > 254 || !isEmail(recipient))
    throw new Error('请通过 AUTH_ACCEPTANCE_RECIPIENT 指定一个受控测试邮箱');
  if (env.AUTH_ACCEPTANCE_SEND_MAIL !== 'yes')
    throw new Error('真实发信验收需明确设置 AUTH_ACCEPTANCE_SEND_MAIL=yes');

  return { databaseUrl, recipient, origin: publicUrl.origin };
}

// Construct after the caller resolves the explicit test target and installs its
// environment. Importing this helper never reads .env or constructs a DB client.
export function authAcceptanceModule() {
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [configuration],
        validate: validateEnvironment,
      }),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 90 }]),
      PrismaModule,
      AuthModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
  class AuthAcceptanceModule {}
  return AuthAcceptanceModule;
}

export function configureAuthAcceptanceApp(
  app: INestApplication,
  settings: AuthAcceptanceSettings,
): void {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: settings.origin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const mailer = app.get(MailerService);
  const sendMail = mailer.sendMail.bind(mailer);
  mailer.sendMail = (options) => {
    if (
      typeof options.to !== 'string' ||
      options.to.trim().toLowerCase() !== settings.recipient ||
      options.cc !== undefined ||
      options.bcc !== undefined
    )
      throw new Error('验收入口只允许向指定受控邮箱单独发信');
    return sendMail(options);
  };
}
