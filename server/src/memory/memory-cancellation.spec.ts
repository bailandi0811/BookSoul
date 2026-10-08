import { ConfigService } from '@nestjs/config';
import { MemoryService } from './memory.service';
import { MilvusService } from '../milvus/milvus.service';
import { MemoryEntryRepository } from './repositories/memory-entry.repository';
import { UserProfileRepository } from './repositories/user-profile.repository';
import { ImportanceScorerStrategy } from './strategies/importance-scorer.strategy';

describe('deep memory embedding transport', () => {
  afterEach(() => jest.restoreAllMocks());
  it('propagates cancellation to the actual transport without retry or vector upsert', async () => {
    const controller = new AbortController();
    let transportSignal: AbortSignal | null | undefined;
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) => {
        transportSignal = init?.signal;
        controller.abort();
        return new Response(
          JSON.stringify({
            data: [{ index: 0, embedding: [1, 0, 0] }],
            model: 'fixture',
            usage: { prompt_tokens: 1, total_tokens: 1 },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      });
    const upsert = jest.fn();
    const config = {
      get: (key: string) =>
        ({
          'openai.apiKey': 'fixture',
          'openai.baseUrl': 'https://fixture.invalid/v1',
          'openai.embeddingModel': 'fixture',
          'openai.chatModel': 'fixture',
          'milvus.vectorDim': 3,
        })[key],
    } as unknown as ConfigService;
    const service = new MemoryService(
      config,
      {
        isAvailable: () => true,
        getClient: () => ({ upsert }),
      } as unknown as MilvusService,
      {} as UserProfileRepository,
      {
        generateId: () => 'fixture-memory',
        save: jest.fn(),
        getByUserId: jest.fn().mockResolvedValue([]),
        getForBookContext: jest.fn().mockResolvedValue([]),
      } as unknown as MemoryEntryRepository,
      new ImportanceScorerStrategy(),
    );
    await expect(
      service.processAndStoreBookMemory(
        'fixture-owner',
        'fixture-session',
        'fixture-book',
        '请记住以后回答要简洁',
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(transportSignal?.aborted).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
    expect(
      Reflect.get(Reflect.get(service, 'embeddings') as object, 'caller')
        .maxRetries,
    ).toBe(1);
    expect(
      Reflect.get(
        Reflect.get(service, 'cancellableEmbeddings') as object,
        'caller',
      ).maxRetries,
    ).toBe(0);
  });
});
