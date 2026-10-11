import { NestFactory } from '@nestjs/core';
import { IngestionRuntimeModule } from './ingestion/ingestion-runtime.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    IngestionRuntimeModule,
  );
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
}
void bootstrap();
