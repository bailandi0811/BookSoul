import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { MilvusService } from '../milvus/milvus.service';
import { ClaimService } from './claim.service';

describe('ClaimService', () => {
  const guestId = 'guest_550e8400-e29b-41d4-a716-446655440000';
  const userId = 'user-1';
  const sessionId = 'session-1';
  let root: string;
  let cwdSpy: jest.SpyInstance;
  let milvus: {
    query: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };
  let service: ClaimService;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'booksoul-claim-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
    milvus = {
      query: jest.fn().mockResolvedValue({ data: [] }),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };
    service = new ClaimService({
      getClient: () => milvus,
    } as unknown as MilvusService);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const writeJson = (relativePath: string, value: unknown) => {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value));
  };

  const writeGuestHistory = (owner = guestId) => {
    writeJson(`chat_histories/session_${sessionId}.json`, {
      '': { [sessionId]: { userId: owner, messages: [] } },
    });
  };

  it('claims chat history and session memory files', async () => {
    writeGuestHistory();
    writeJson(`memories/profiles/${guestId}/${sessionId}.json`, {
      userId: guestId,
      sessionId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      preferences: { favoriteCharacters: [], interests: ['武侠'] },
      facts: {},
      summary: '',
    });
    writeJson(`memories/long_term/${guestId}/memory.json`, {
      id: 'memory',
      userId: guestId,
      sessionId,
      content: '喜欢乔峰',
    });

    const result = await service.claimGuest(guestId, sessionId, userId);

    expect(result).toEqual({
      status: 'completed',
      history: 'claimed',
      memory: 'claimed',
      vectors: 'already_claimed',
    });
    const history = JSON.parse(
      fs.readFileSync(
        path.join(root, `chat_histories/session_${sessionId}.json`),
        'utf8',
      ),
    ) as { '': Record<string, { userId: string }> };
    expect(history[''][sessionId].userId).toBe(userId);
    const memory = JSON.parse(
      fs.readFileSync(
        path.join(root, `memories/long_term/${userId}/memory.json`),
        'utf8',
      ),
    ) as { userId: string };
    expect(memory.userId).toBe(userId);
    expect(
      fs.existsSync(path.join(root, `memories/long_term/${guestId}/memory.json`)),
    ).toBe(false);
  });

  it('is idempotent for an already claimed history', async () => {
    writeGuestHistory(userId);
    milvus.query
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'memory' }] });

    await expect(
      service.claimGuest(guestId, sessionId, userId),
    ).resolves.toEqual({
      status: 'already_claimed',
      history: 'already_claimed',
      memory: 'none',
      vectors: 'already_claimed',
    });
  });

  it('continues when chat history is missing', async () => {
    await expect(
      service.claimGuest(guestId, sessionId, userId),
    ).resolves.toEqual({
      status: 'already_claimed',
      history: 'none',
      memory: 'none',
      vectors: 'already_claimed',
    });
  });

  it('claims profile data even when chat history is missing', async () => {
    writeJson(`memories/profiles/${guestId}/${sessionId}.json`, {
      userId: guestId,
      sessionId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      preferences: { favoriteCharacters: [], interests: [] },
      facts: { city: '杭州' },
      summary: '',
    });

    const result = await service.claimGuest(guestId, sessionId, userId);

    expect(result).toMatchObject({
      status: 'completed',
      history: 'none',
      memory: 'claimed',
    });
    const profile = JSON.parse(
      fs.readFileSync(
        path.join(root, `memories/profiles/${userId}/${sessionId}.json`),
        'utf8',
      ),
    ) as { userId: string };
    expect(profile.userId).toBe(userId);
  });

  it('rejects chat histories owned by another identity', async () => {

    writeGuestHistory('user-2');
    await expect(
      service.claimGuest(guestId, sessionId, userId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects the legacy shared anonymous identity', async () => {
    writeJson(`chat_histories/session_${sessionId}.json`, {
      '': { [sessionId]: { messages: [] } },
    });

    await expect(
      service.claimGuest('anonymous', sessionId, userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports partial when Milvus is unavailable and remains retryable', async () => {
    writeGuestHistory();
    milvus.query.mockRejectedValue(new Error('unavailable'));

    const result = await service.claimGuest(guestId, sessionId, userId);

    expect(result.status).toBe('partial');
    expect(result.vectors).toBe('unavailable');
  });

  it('rewrites vector ownership and removes the guest copies', async () => {
    writeGuestHistory();
    milvus.query.mockResolvedValueOnce({
      data: [{ id: 'memory', user_id: guestId, session_id: sessionId }],
    });

    const result = await service.claimGuest(guestId, sessionId, userId);

    expect(result.vectors).toBe('claimed');
    expect(milvus.upsert).toHaveBeenCalledWith({
      collection_name: 'memory_embeddings',
      data: [{ id: 'memory', user_id: userId, session_id: sessionId }],
    });
    expect(milvus.delete).toHaveBeenCalledWith({
      collection_name: 'memory_embeddings',
      filter: `user_id == "${guestId}" && session_id == "${sessionId}"`,
    });
  });
});
