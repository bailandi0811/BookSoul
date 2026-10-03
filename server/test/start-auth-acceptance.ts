import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuthMailService } from '../src/auth/auth-mail.service';
import { validateEnvironment } from '../src/config/env.validation';
import {
  authAcceptanceModule,
  configureAuthAcceptanceApp,
  resolveAuthAcceptanceSettings,
} from './support/auth-acceptance';

async function bootstrap(): Promise<void> {
  let app: INestApplication | undefined;
  let stage = '隔离目标及收件授权';
  try {
    const settings = resolveAuthAcceptanceSettings(process.env);
    stage = '读取与校验配置';
    const file = parse(readFileSync(resolve(__dirname, '../.env')));
    for (const [key, value] of Object.entries(file)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    // Only this child process changes datasource. The parent's application URL
    // stays available for future isolation comparisons.
    process.env.DATABASE_URL = settings.databaseUrl;
    validateEnvironment(process.env);

    stage = '初始化认证模块';
    app = await NestFactory.create(authAcceptanceModule(), {
      abortOnError: false,
      logger: ['error', 'warn'],
    });
    configureAuthAcceptanceApp(app, settings);
    app.get(AuthMailService).assertConfigured('otp');
    app.get(AuthMailService).assertConfigured('reset');
    app.enableShutdownHooks();
    stage = '监听 3000 端口';
    await app.listen(3000, 'localhost');
    console.log('认证验收 API：http://localhost:3000/api/auth');
    console.log('数据库：127.0.0.1:5432 / booksoul_test / test_auth');
    console.log('点击发码或找回时，仅向指定受控邮箱发信；Ctrl+C 结束验收。');
  } catch (error: unknown) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    const portHint = code === 'EADDRINUSE' ? '；请先停止占用 3000 的旧后端' : '';
    console.error(`认证验收启动失败：${stage}${portHint}。`);
    if (stage === '隔离目标及收件授权')
      console.error(
        '检查两个显式数据库 URL、AUTH_CHALLENGE_SECRET、AUTH_PUBLIC_BASE_URL、AUTH_ACCEPTANCE_RECIPIENT 和 AUTH_ACCEPTANCE_SEND_MAIL=yes。',
      );
    if (app) await app.close();
    process.exitCode = 1;
  }
}

void bootstrap();
