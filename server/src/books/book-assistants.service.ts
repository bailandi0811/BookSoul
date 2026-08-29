import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookStatus, BookVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { defaultBookAssistantName } from './book-assistant.policy';
import type { UpdateBookAssistantDto } from './dto/update-book-assistant.dto';

const ASSISTANT_SELECT = {
  id: true,
  bookId: true,
  name: true,
  responseDepth: true,
  tone: true,
  customInstruction: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class BookAssistantsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(ownerId: string, bookId: string) {
    const book = await this.requireReadyBook(ownerId, bookId);
    return this.prisma.bookAssistant.upsert({
      where: { ownerId_bookId: { ownerId, bookId: book.id } },
      create: {
        ownerId,
        bookId: book.id,
        name: defaultBookAssistantName(book.title),
      },
      update: {},
      select: ASSISTANT_SELECT,
    });
  }

  async update(ownerId: string, bookId: string, input: UpdateBookAssistantDto) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('请至少提供一项助手设置');
    }
    const current = await this.get(ownerId, bookId);
    const data: Prisma.BookAssistantUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('助手名称不能为空');
      data.name = name;
    }
    if (input.responseDepth !== undefined) {
      data.responseDepth = input.responseDepth;
    }
    if (input.tone !== undefined) data.tone = input.tone;
    if (input.customInstruction !== undefined) {
      data.customInstruction = input.customInstruction?.trim() || null;
    }

    return this.prisma.bookAssistant.update({
      where: { id: current.id },
      data,
      select: ASSISTANT_SELECT,
    });
  }

  private async requireReadyBook(ownerId: string, bookId: string) {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        OR: [
          { ownerId, visibility: BookVisibility.PRIVATE },
          { visibility: BookVisibility.SYSTEM },
        ],
      },
      select: { id: true, title: true, status: true },
    });
    if (!book) throw new NotFoundException('书籍不存在');
    if (book.status !== BookStatus.READY) {
      throw new ConflictException('小说处理完成后才能使用阅读助手');
    }
    return book;
  }
}
