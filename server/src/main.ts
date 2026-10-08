import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Server } from 'node:http';
import { AppModule } from './app.module';
import { CommunityWsAdapter } from './community/community.ws-adapter';
import { CommunityTicketsService } from './community/community.tickets.service';
import { ApplicationDrainService } from './common/application-drain.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  const drain = app.get(ApplicationDrainService);
  app.use(drain.middleware);
  if (process.env.NODE_ENV === 'production') {
    // Deployment exposes only Nginx, which replaces the forwarded client IP.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const communityTickets = app.get(CommunityTicketsService);
  communityTickets.setAllowedOrigins(allowedOrigins);
  app.useWebSocketAdapter(
    new CommunityWsAdapter(
      app.getHttpServer() as Server,
      communityTickets,
      () => drain.isDraining,
    ),
  );
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS'));
    },
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Guest-User-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
}
void bootstrap();
