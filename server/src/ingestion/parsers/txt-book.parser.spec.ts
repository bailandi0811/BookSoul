import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { IngestionError } from '../errors/ingestion-error';
import { TxtBookParser } from './txt-book.parser';

describe('TxtBookParser', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'booksoul-txt-parser-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('decodes UTF-8 and preserves Chinese chapter order', async () => {
    const filePath = await writeFixture(
      'book.txt',
      Buffer.from(
        '《测试小说》\n\n第一章 初遇\n第一章正文。\n\n第二章：重逢\n第二章正文。',
      ),
    );

    const result = await createParser().parse({
      filePath,
      originalFileName: '测试小说.txt',
    });

    expect(result.title).toBe('测试小说');
    expect(result.sections).toHaveLength(2);
    expect(result.sections.map((section) => section.title)).toEqual([
      '第一章 初遇',
      '第二章：重逢',
    ]);
    expect(result.sections[0]).toEqual(
      expect.objectContaining({
        order: 1,
        content: expect.stringContaining('第一章正文'),
      }),
    );
  });

  it('falls back to GB18030 when UTF-8 decoding fails', async () => {
    const gb18030 = Buffer.from('b5dad2bbd5c20ab9cacac2bfaacabc', 'hex');
    const filePath = await writeFixture('legacy.txt', gb18030);

    const result = await createParser().parse({
      filePath,
      originalFileName: '旧书.txt',
    });

    expect(result.sections[0].title).toBe('第一章');
    expect(result.sections[0].content).toContain('故事开始');
  });

  it('creates deterministic fallback sections without chapter headings', async () => {
    const filePath = await writeFixture(
      'plain.txt',
      Buffer.from('甲'.repeat(12) + '\n\n' + '乙'.repeat(12)),
    );

    const result = await createParser({
      'books.txtFallbackSectionChars': 12,
    }).parse({ filePath, originalFileName: '无目录.txt' });

    expect(result.sections.map((section) => section.title)).toEqual([
      '第 1 节',
      '第 2 节',
    ]);
    expect(result.sections.map((section) => section.order)).toEqual([1, 2]);
  });

  it('rejects UTF-16 and empty text with stable error codes', async () => {
    const utf16Path = await writeFixture(
      'utf16.txt',
      Buffer.from([0xff, 0xfe, 0x41, 0x00]),
    );
    const emptyPath = await writeFixture('empty.txt', Buffer.alloc(0));
    const parser = createParser();

    await expect(
      parser.parse({ filePath: utf16Path, originalFileName: 'utf16.txt' }),
    ).rejects.toMatchObject<Partial<IngestionError>>({
      code: 'TEXT_ENCODING_UNSUPPORTED',
    });
    await expect(
      parser.parse({ filePath: emptyPath, originalFileName: 'empty.txt' }),
    ).rejects.toMatchObject<Partial<IngestionError>>({ code: 'EMPTY_CONTENT' });
  });

  it('enforces the configured section limit', async () => {
    const filePath = await writeFixture(
      'many.txt',
      Buffer.from('第一章\n一\n第二章\n二'),
    );

    await expect(
      createParser({ 'books.maxSections': 1 }).parse({
        filePath,
        originalFileName: 'many.txt',
      }),
    ).rejects.toMatchObject<Partial<IngestionError>>({
      code: 'SECTION_LIMIT_EXCEEDED',
    });
  });

  function createParser(values: Record<string, number> = {}): TxtBookParser {
    return new TxtBookParser({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);
  }

  async function writeFixture(name: string, content: Buffer): Promise<string> {
    const filePath = path.join(root, name);
    await writeFile(filePath, content);
    return filePath;
  }
});
