import { NotFoundException } from '@nestjs/common';
import {
  AssistantResponseDepth,
  AssistantTone,
  BookStatus,
  BookVisibility,
} from '@prisma/client';
import { BookAssistantsService } from '../books/book-assistants.service';
import { BookReadingService } from '../books/book-reading.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookSessionsService } from './book-sessions.service';

describe('BookSessionsService', () => {
  let prisma: {
    chatSessionRecord: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let assistants: { get: jest.Mock };
  let reading: { getRetrievalBoundary: jest.Mock };
  let service: BookSessionsService;

  beforeEach(() => {
    prisma = {
      chatSessionRecord: {
        create: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            sessionId: data.sessionId,
            title: data.title,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(sessionRecord()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    assistants = {
      get: jest.fn().mockResolvedValue({ id: 'assistant-a' }),
    };
    reading = {
      getRetrievalBoundary: jest.fn().mockResolvedValue({
        ownerScope: 'user-a',
        bookId: 'book-a',
        embeddingVersion: 'book-embedding-v1',
        spoilerCeiling: 2,
      }),
    };
    service = new BookSessionsService(
      prisma as unknown as PrismaService,
      assistants as unknown as BookAssistantsService,
      reading as unknown as BookReadingService,
    );
  });

  it('creates an unpredictable server UUID bound to the scoped assistant', async () => {
    const created = await service.create('user-a', 'book-a');

    expect(created.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(prisma.chatSessionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'user-a',
          bookAssistantId: 'assistant-a',
          title: '新对话',
          messages: [],
        }),
      }),
    );
  });

  it('lists only sessions for the current owner and book assistant', async () => {
    await service.list('user-a', 'book-a');
    expect(prisma.chatSessionRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'user-a', bookAssistantId: 'assistant-a' },
      }),
    );
  });

  it('resolves all chat scope from the owner/session record', async () => {
    await expect(service.resolve('user-a', 'session-a')).resolves.toEqual(
      expect.objectContaining({
        ownerId: 'user-a',
        assistantId: 'assistant-a',
        bookId: 'book-a',
        bookTitle: '长夜行',
        boundary: expect.objectContaining({ spoilerCeiling: 2 }),
      }),
    );
    expect(reading.getRetrievalBoundary).toHaveBeenCalledWith(
      'user-a',
      'book-a',
      false,
    );
  });

  it('fails closed for a missing, foreign or legacy unscoped session', async () => {
    prisma.chatSessionRecord.findUnique.mockResolvedValue(null);
    await expect(service.resolve('user-a', 'session-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(reading.getRetrievalBoundary).not.toHaveBeenCalled();
  });

  it('appends messages without changing the bound assistant and derives a title', async () => {
    prisma.chatSessionRecord.findUnique.mockResolvedValue({
      messages: [],
      title: '新对话',
    });
    const context = await resolvedContext();
    await service.appendExchange(context, '  第一章发生了什么？  ', '回答');

    expect(prisma.chatSessionRecord.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'user-a',
        sessionId: 'session-a',
        bookAssistantId: 'assistant-a',
      },
      data: expect.objectContaining({
        title: '第一章发生了什么？',
        messages: [
          { type: 'human', data: { content: '  第一章发生了什么？  ' } },
          { type: 'ai', data: { content: '回答' } },
        ],
      }),
    });
  });

  async function resolvedContext() {
    prisma.chatSessionRecord.findUnique.mockResolvedValue(sessionRecord());
    return service.resolve('user-a', 'session-a');
  }

  function sessionRecord() {
    return {
      ownerId: 'user-a',
      sessionId: 'session-a',
      title: '新对话',
      messages: [],
      bookAssistant: {
        id: 'assistant-a',
        ownerId: 'user-a',
        name: '《长夜行》阅读助手',
        responseDepth: AssistantResponseDepth.BALANCED,
        tone: AssistantTone.NATURAL,
        customInstruction: null,
        book: {
          id: 'book-a',
          ownerId: 'user-a',
          visibility: BookVisibility.PRIVATE,
          status: BookStatus.READY,
          title: '长夜行',
        },
      },
    };
  }
});
