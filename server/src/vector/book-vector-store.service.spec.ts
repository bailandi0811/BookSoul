import { ConfigService } from '@nestjs/config';
import { MilvusService } from '../milvus/milvus.service';
import { BookVectorStoreService } from './book-vector-store.service';

describe('BookVectorStoreService', () => {
  let client: {
    hasCollection: jest.Mock;
    createCollection: jest.Mock;
    createIndex: jest.Mock;
    loadCollection: jest.Mock;
    describeCollection: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
    flush: jest.Mock;
    count: jest.Mock;
    search: jest.Mock;
  };
  let service: BookVectorStoreService;

  beforeEach(() => {
    client = {
      hasCollection: jest.fn().mockResolvedValue({ value: false }),
      createCollection: jest.fn().mockResolvedValue({}),
      createIndex: jest.fn().mockResolvedValue({}),
      loadCollection: jest.fn().mockResolvedValue({}),
      describeCollection: jest.fn(),
      insert: jest.fn().mockResolvedValue({ insert_cnt: '1' }),
      delete: jest.fn().mockResolvedValue({ delete_cnt: '0' }),
      flush: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue({ data: 1 }),
      search: jest.fn().mockResolvedValue({
        results: [{ id: 'chunk-a', score: 0.9 }],
      }),
    };
    service = new BookVectorStoreService(
      {
        get: jest.fn((key: string) => {
          const values: Record<string, unknown> = {
            'milvus.bookCollectionName': 'book_chunks_v2',
            'milvus.vectorDim': 3,
            'milvus.requestTimeoutMs': 1_000,
          };
          return values[key];
        }),
      } as unknown as ConfigService,
      { getClient: jest.fn(() => client) } as unknown as MilvusService,
    );
  });

  it('creates the isolated collection without storing source content', async () => {
    await service.ensureCollection();

    expect(client.createCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        collection_name: 'book_chunks_v2',
        enable_dynamic_field: false,
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'owner_scope' }),
          expect.objectContaining({ name: 'book_id' }),
          expect.objectContaining({ name: 'embedding_version' }),
          expect.objectContaining({ name: 'vector', dim: 3 }),
        ]),
      }),
    );
    const fields = client.createCollection.mock.calls[0][0].fields as Array<{
      name: string;
    }>;
    expect(fields).not.toContainEqual(
      expect.objectContaining({ name: 'content' }),
    );
  });

  it('writes only server-scoped metadata and a validated vector', async () => {
    await service.insert([
      {
        id: 'chunk-a',
        ownerScope: 'user-a',
        bookId: 'book-a',
        sectionId: 'section-a',
        sectionOrder: 1,
        chunkIndex: 0,
        embeddingVersion: 'book-embedding-v1',
        vector: [1, 0, 0],
      },
    ]);

    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 'chunk-a',
            owner_scope: 'user-a',
            book_id: 'book-a',
            section_id: 'section-a',
            embedding_version: 'book-embedding-v1',
          }),
        ],
      }),
    );
  });

  it('deletes one exact owner/book/version scope and rejects unsafe values', async () => {
    client.hasCollection.mockResolvedValue({ value: true });

    await service.deleteVersion({
      ownerScope: 'user-a',
      bookId: 'book-a',
      embeddingVersion: 'book-embedding-v1',
    });

    expect(client.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        filter:
          'owner_scope == "user-a" && book_id == "book-a" && embedding_version == "book-embedding-v1"',
      }),
    );
    await expect(
      service.deleteBook('user-a" || owner_scope != "', 'book-a'),
    ).rejects.toThrow('Unsafe Milvus book scope value');
  });

  it('searches only within owner, book, version and spoiler ceiling', async () => {
    await expect(
      service.searchChunkIds(
        {
          ownerScope: 'user-a',
          bookId: 'book-a',
          embeddingVersion: 'book-embedding-v1',
        },
        [1, 0, 0],
        2,
        6,
      ),
    ).resolves.toEqual([{ id: 'chunk-a', score: 0.9 }]);

    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({
        collection_name: 'book_chunks_v2',
        filter:
          'owner_scope == "user-a" && book_id == "book-a" && embedding_version == "book-embedding-v1" && section_order <= 2',
        output_fields: ['id'],
      }),
    );
  });
});
