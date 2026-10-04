import {
  INestApplication,
  ExecutionContext,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookReaderController } from './book-reader.controller';
import { BookReaderService } from './book-reader.service';
import { BookReaderPositionService } from './book-reader-position.service';

describe('reader HTTP contract', () => {
  let app: INestApplication;
  const reader = {
    getSectionWindow: jest.fn().mockResolvedValue({ text: '合成正文' }),
    getReferenceLocation: jest.fn().mockResolvedValue({ precision: 'section' }),
  };
  const positions = {
    getPosition: jest.fn().mockResolvedValue(null),
    savePosition: jest.fn().mockResolvedValue({ revision: 1 }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BookReaderController],
      providers: [
        { provide: BookReaderService, useValue: reader },
        { provide: BookReaderPositionService, useValue: positions },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context
            .switchToHttp()
            .getRequest<{
              headers: Record<string, string>;
              authContext: unknown;
            }>();
          if (req.headers.authorization !== 'Bearer fixture')
            throw new UnauthorizedException();
          req.authContext = { kind: 'user', userId: 'owner' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => app.close());
  it('requires authenticated identity and marks private text no-store', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/books/book/sections/section/content')
      .expect(401);
    const response = await request(app.getHttpServer() as Server)
      .get('/api/books/book/sections/section/content?offset=1024&limit=2048')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual({
      success: true,
      data: { text: '合成正文' },
    });
    expect(reader.getSectionWindow).toHaveBeenCalledWith(
      'owner',
      'book',
      'section',
      expect.objectContaining({ offset: 1024, limit: 2048 }),
    );
  });
  it('rejects unsafe ranges and user-supplied ownership', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/books/book/sections/section/content?limit=999999')
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    await request(app.getHttpServer() as Server)
      .get('/api/books/book/sections/section/content?ownerId=other')
      .set('Authorization', 'Bearer fixture')
      .expect(400);
  });
  it('locates citations under the authenticated book scope', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/books/book/chunks/chunk/location')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    expect(reader.getReferenceLocation).toHaveBeenCalledWith(
      'owner',
      'book',
      'chunk',
    );
  });
  it('exposes independent position routes, refuses untrusted owners, and validates revisions', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/books/book/reading-position')
      .expect(401);
    const response = await request(app.getHttpServer() as Server)
      .get('/api/books/book/reading-position')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    expect(response.body).toEqual({ success: true, data: null });
    const input = {
      sectionId: 'section',
      offset: 0,
      contentHash: 'a'.repeat(64),
      expectedRevision: 0,
    };
    await request(app.getHttpServer() as Server)
      .put('/api/books/book/reading-position')
      .set('Authorization', 'Bearer fixture')
      .send(input)
      .expect(200);
    expect(positions.savePosition).toHaveBeenCalledWith('owner', 'book', input);
    await request(app.getHttpServer() as Server)
      .put('/api/books/book/reading-position')
      .set('Authorization', 'Bearer fixture')
      .send({ ...input, ownerId: 'other' })
      .expect(400);
  });
});
