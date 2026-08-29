import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AssistantResponseDepth,
  AssistantTone,
  BookStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookAssistantsService } from './book-assistants.service';

describe('BookAssistantsService', () => {
  let prisma: {
    book: { findFirst: jest.Mock };
    bookAssistant: { upsert: jest.Mock; update: jest.Mock };
  };
  let service: BookAssistantsService;

  beforeEach(() => {
    prisma = {
      book: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'book-a',
          title: '长夜行',
          status: BookStatus.READY,
        }),
      },
      bookAssistant: {
        upsert: jest.fn().mockResolvedValue(assistant()),
        update: jest.fn().mockResolvedValue(assistant()),
      },
    };
    service = new BookAssistantsService(prisma as unknown as PrismaService);
  });

  it('gets or repairs the one assistant inside the authenticated book scope', async () => {
    await expect(service.get('user-a', 'book-a')).resolves.toEqual(assistant());

    expect(prisma.book.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'book-a',
          OR: expect.arrayContaining([
            { ownerId: 'user-a', visibility: 'PRIVATE' },
          ]),
        },
      }),
    );
    expect(prisma.bookAssistant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerId_bookId: { ownerId: 'user-a', bookId: 'book-a' },
        },
        create: expect.objectContaining({ name: '《长夜行》阅读助手' }),
      }),
    );
  });

  it('does not reveal another user private book', async () => {
    prisma.book.findFirst.mockResolvedValue(null);

    await expect(service.get('user-a', 'book-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.bookAssistant.upsert).not.toHaveBeenCalled();
  });

  it('does not expose an assistant before the book is ready', async () => {
    prisma.book.findFirst.mockResolvedValue({
      id: 'book-a',
      title: '长夜行',
      status: BookStatus.EMBEDDING,
    });

    await expect(service.get('user-a', 'book-a')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('updates only validated presentation settings for the scoped assistant', async () => {
    prisma.bookAssistant.update.mockResolvedValue(
      assistant({
        name: '夜航伙伴',
        responseDepth: AssistantResponseDepth.DEEP,
        tone: AssistantTone.WARM,
        customInstruction: '多问我一个问题',
      }),
    );

    await service.update('user-a', 'book-a', {
      name: '  夜航伙伴  ',
      responseDepth: AssistantResponseDepth.DEEP,
      tone: AssistantTone.WARM,
      customInstruction: '  多问我一个问题  ',
    });

    expect(prisma.bookAssistant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assistant-a' },
        data: {
          name: '夜航伙伴',
          responseDepth: AssistantResponseDepth.DEEP,
          tone: AssistantTone.WARM,
          customInstruction: '多问我一个问题',
        },
      }),
    );
  });

  it('rejects empty patches and whitespace-only names', async () => {
    await expect(service.update('user-a', 'book-a', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.update('user-a', 'book-a', { name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  function assistant(overrides: Record<string, unknown> = {}) {
    return {
      id: 'assistant-a',
      bookId: 'book-a',
      name: '《长夜行》阅读助手',
      responseDepth: AssistantResponseDepth.BALANCED,
      tone: AssistantTone.NATURAL,
      customInstruction: null,
      createdAt: new Date('2026-08-29T00:00:00.000Z'),
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
      ...overrides,
    };
  }
});
