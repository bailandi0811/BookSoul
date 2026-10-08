import { ConfigService } from '@nestjs/config';
import { MilvusService } from '../milvus/milvus.service';
import { MemoryEntryRepository } from '../memory/repositories/memory-entry.repository';
import { UserProfileRepository } from '../memory/repositories/user-profile.repository';
import { ImportanceScorerStrategy } from '../memory/strategies/importance-scorer.strategy';
import { createIsolatedDeepReadingMemory } from '../../test/deep-reading-memory-provider';
describe('live test memory isolation', () => {
  it('keeps real memory logic but confines startup and writes to the test collection', async () => {
    const client = {
      hasCollection: jest.fn().mockResolvedValue({ value: true }),
      loadCollection: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            'openai.apiKey': 'fixture',
            'openai.chatModel': 'fixture',
            'openai.embeddingModel': 'fixture',
            'milvus.vectorDim': 3,
          })[key],
      ),
    } as unknown as ConfigService;
    const service = createIsolatedDeepReadingMemory(
      'test_deep_memory',
      config,
      {
        getClient: () => client,
        isAvailable: () => true,
      } as unknown as MilvusService,
      {} as UserProfileRepository,
      {
        generateId: () => 'fixture-memory',
        save: jest.fn().mockResolvedValue(undefined),
      } as unknown as MemoryEntryRepository,
      {} as ImportanceScorerStrategy,
    );
    Object.assign(service, {
      embeddings: { embedQuery: jest.fn().mockResolvedValue([1, 0, 0]) },
    });
    await service.onModuleInit();
    await service.createMemory('fixture-user', {
      sessionId: 'fixture-session',
      content: '合成偏好',
    });
    expect(client.hasCollection).toHaveBeenCalledWith({
      collection_name: 'test_deep_memory',
    });
    expect(client.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ collection_name: 'test_deep_memory' }),
    );
    expect(JSON.stringify(client.hasCollection.mock.calls)).not.toContain(
      'memory_embeddings',
    );
  });
});
