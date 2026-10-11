import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MilvusService } from '../milvus/milvus.service';
import { IngestionModule } from './ingestion.module';
import { IngestionWorkerService } from './ingestion-worker.service';

const forbiddenDatabase = jest.fn(() => {
  throw new Error('DATABASE_FORBIDDEN');
});
const forbiddenVector = jest.fn(() => {
  throw new Error('VECTOR_FORBIDDEN');
});
@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) =>
          key === 'books.ingestionWorkerEnabled' ? false : undefined,
      },
    },
    { provide: PrismaService, useValue: { $transaction: forbiddenDatabase } },
    { provide: MilvusService, useValue: { getClient: forbiddenVector } },
  ],
  exports: [ConfigService, PrismaService, MilvusService],
})
class IsolatedDependenciesModule {}

describe('standalone ingestion module wiring', () => {
  it('assembles the worker without auth/chat modules or external connections', async () => {
    const module = await Test.createTestingModule({
      imports: [IsolatedDependenciesModule, IngestionModule],
    }).compile();
    try {
      await module.init();
      expect(module.get(IngestionWorkerService)).toBeInstanceOf(
        IngestionWorkerService,
      );
      expect(forbiddenDatabase).not.toHaveBeenCalled();
      expect(forbiddenVector).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
