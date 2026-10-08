import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TarotController } from './tarot.controller';
import { TarotAuthGuard } from './tarot-auth.guard';
import { TarotStateService } from './tarot-state.service';
import { TarotProviderService } from './tarot-provider.service';

describe('tarot HTTP contract (no database)', () => {
  let app: INestApplication;
  const classify = jest.fn();
  const read = jest.fn();
  beforeEach(async () => {
    classify
      .mockReset()
      .mockResolvedValue({ mode: 'fixed', spread: 'yes_no', reason: null });
    read.mockReset().mockImplementation(async function* () {
      yield '测试正文';
    });
    const module = await Test.createTestingModule({
      controllers: [TarotController],
      providers: [
        TarotStateService,
        { provide: TarotProviderService, useValue: { classify, read } },
      ],
    })
      .overrideGuard(TarotAuthGuard)
      .useValue({
        canActivate(context: {
          switchToHttp(): {
            getRequest(): {
              headers: Record<string, string>;
              authContext?: object;
            };
          };
        }) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers['x-test-owner']) return false;
          req.authContext = {
            kind: 'user',
            userId: req.headers['x-test-owner'],
            email: 'test@example.test',
            name: 'Reader',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  const post = (route: string, owner = 'reader-a') =>
    request(app.getHttpServer())
      .post(`/api/tarot/${route}`)
      .set('x-test-owner', owner);
  const round = async () => {
    const permit = (
      await post('classifications')
        .send({ question: '  他会回来吗  ' })
        .expect(200)
    ).body.permit as string;
    return (await post('draws').send({ permit, spread: 'yes_no' }).expect(200))
      .body.readingId as string;
  };
  it('validates before calling providers and excludes question/confidence from responses', async () => {
    await post('classifications').send({ question: '' }).expect(400);
    await post('classifications')
      .send({ question: '字'.repeat(301) })
      .expect(400);
    expect(classify).not.toHaveBeenCalled();
    const result = await post('classifications')
      .send({ question: '  测试  ' })
      .expect(200);
    expect(classify.mock.calls[0][0]).toBe('测试');
    expect(result.body).not.toHaveProperty('question');
    expect(result.body).not.toHaveProperty('confidence');
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('rejects cross-owner IDs, incomplete reads and extra client-supplied cards', async () => {
    const readingId = await round();
    await post('reveals', 'reader-b').send({ readingId, index: 0 }).expect(400);
    await post('readings').send({ readingId }).expect(409);
    await post('reveals').send({ readingId, index: 0 }).expect(200);
    await post('readings').send({ readingId, cards: [] }).expect(400);
    await post('readings')
      .send({ readingId, spread: 'three_card' })
      .expect(400);
    await post('readings')
      .send({ readingId, question: '替换问题' })
      .expect(400);
    expect(read).not.toHaveBeenCalled();
  });
  it('emits one terminal event and uses the original normalized question', async () => {
    const readingId = await round();
    await post('reveals').send({ readingId, index: 0 }).expect(200);
    const result = await post('readings').send({ readingId }).expect(200);
    expect(result.headers['content-type']).toContain('text/event-stream');
    expect(result.text).toContain('"content":"测试正文"');
    expect(result.text.match(/"done":true/g)).toHaveLength(1);
    expect(result.text).not.toContain('"error"');
    expect(read.mock.calls[0][0]).toMatchObject({
      question: '他会回来吗',
      spread: 'yes_no',
      cards: [expect.objectContaining({ position: 'answer' })],
    });
    expect(read.mock.calls[0]).toHaveLength(2);
  });
  it.each(['yes_no', 'triangle'] as const)(
    'emits only an error and retries original %s round',
    async (spread) => {
      classify.mockResolvedValue({ mode: 'fixed', spread, reason: null });
      const permit = (
        await post('classifications').send({ question: '合成问题' }).expect(200)
      ).body.permit as string;
      const readingId = (
        await post('draws').send({ permit, spread }).expect(200)
      ).body.readingId as string;
      for (let i = 0; i < (spread === 'yes_no' ? 1 : 3); i++)
        await post('reveals').send({ readingId, index: i }).expect(200);
      read.mockImplementationOnce(async function* () {
        yield '部分';
        throw new Error('private upstream detail');
      });
      const result = await post('readings').send({ readingId }).expect(200);
      expect(result.text).toContain('TAROT_INTERPRET_FAILED');
      expect(result.text).not.toContain('done');
      expect(result.text).not.toContain('private upstream');
      await post('readings').send({ readingId }).expect(200);
      expect(read.mock.calls[1][0]).toEqual(read.mock.calls[0][0]);
    },
  );
  it.each(['three_card', 'triangle'] as const)(
    'passes three authoritative cards for %s without a fourth slot',
    async (spread) => {
      classify.mockResolvedValue({
        mode: 'fixed',
        spread,
        reason: null,
      });
      const permit = (
        await post('classifications')
          .send({ question: '合成关系问题' })
          .expect(200)
      ).body.permit as string;
      const readingId = (
        await post('draws').send({ permit, spread }).expect(200)
      ).body.readingId as string;
      const cards: unknown[] = [];
      for (const index of [31, 4, 67])
        cards.push(
          (await post('reveals').send({ readingId, index }).expect(200)).body
            .card,
        );
      await post('readings').send({ readingId }).expect(200);
      expect(read.mock.calls[0][0]).toEqual({
        question: '合成关系问题',
        spread,
        cards,
      });
    },
  );
});
