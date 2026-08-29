import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MilvusService } from '../src/milvus/milvus.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'booksoul-e2e-only-access-secret';
    process.env.BOOK_INGESTION_WORKER_ENABLED = 'false';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MilvusService)
      .useValue({
        getClient: () => ({
          describeCollection: jest.fn().mockResolvedValue({}),
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('BookSoul API is running (NestJS)');
  });
});
