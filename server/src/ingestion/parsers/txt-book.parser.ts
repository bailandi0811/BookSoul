import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { IngestionError } from '../errors/ingestion-error';
import { normalizeBookText, titleFromFileName } from '../text-normalization';
import type {
  BookParseSource,
  ParsedBook,
  ParsedSection,
} from '../types/parsed-book';
import type { BookParser } from './book-parser.interface';

const CHAPTER_HEADING =
  /^\s*((?:第[0-9零〇一二三四五六七八九十百千万两]+[章节回部篇卷]|卷[0-9零〇一二三四五六七八九十百千万两]+|chapter\s+[0-9ivxlcdm]+)(?:[\s\u3000:：·.、-]+[^\n]{0,100})?)\s*$/i;

@Injectable()
export class TxtBookParser implements BookParser {
  private readonly maxSections: number;
  private readonly fallbackSectionChars: number;

  constructor(configService: ConfigService) {
    this.maxSections = configService.get<number>('books.maxSections') || 5_000;
    this.fallbackSectionChars =
      configService.get<number>('books.txtFallbackSectionChars') || 20_000;
  }

  async parse(source: BookParseSource): Promise<ParsedBook> {
    const buffer = await readFile(source.filePath);
    const content = normalizeBookText(this.decode(buffer));
    if (!content) {
      throw new IngestionError('EMPTY_CONTENT', '小说正文为空');
    }

    const byHeading = this.splitByHeading(content);
    const sections =
      byHeading.length > 0 ? byHeading : this.splitByLength(content);
    this.assertSectionLimit(sections.length);

    return {
      title: titleFromFileName(source.originalFileName),
      sections: sections.map((section, index) => ({
        ...section,
        order: index + 1,
      })),
    };
  }

  private decode(buffer: Buffer): string {
    if (buffer.length === 0) return '';
    if (this.hasUtf16Bom(buffer) || buffer.subarray(0, 8192).includes(0)) {
      throw new IngestionError(
        'TEXT_ENCODING_UNSUPPORTED',
        'TXT 编码暂不支持，请转换为 UTF-8 或 GB18030',
      );
    }

    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      try {
        return new TextDecoder('gb18030', { fatal: true }).decode(buffer);
      } catch (error) {
        throw new IngestionError(
          'TEXT_ENCODING_UNSUPPORTED',
          'TXT 编码暂不支持，请转换为 UTF-8 或 GB18030',
          { cause: error },
        );
      }
    }
  }

  private splitByHeading(content: string): Omit<ParsedSection, 'order'>[] {
    const lines = content.split('\n');
    const headingCount = lines.reduce(
      (count, line) => count + (CHAPTER_HEADING.test(line) ? 1 : 0),
      0,
    );
    if (headingCount === 0) return [];

    const sections: Omit<ParsedSection, 'order'>[] = [];
    let title: string | null = null;
    let buffer: string[] = [];

    const flush = () => {
      const sectionContent = normalizeBookText(buffer.join('\n'));
      if (sectionContent) {
        sections.push({
          title: title || '前言',
          content: sectionContent,
        });
      }
      buffer = [];
    };

    for (const line of lines) {
      const match = line.match(CHAPTER_HEADING);
      if (!match) {
        buffer.push(line);
        continue;
      }

      if (title !== null || normalizeBookText(buffer.join('\n')).length >= 50) {
        flush();
      }
      title = match[1].trim().slice(0, 200);
    }
    flush();

    return sections;
  }

  private splitByLength(content: string): Omit<ParsedSection, 'order'>[] {
    const paragraphs = this.breakLongParagraphs(
      content.split(/\n{2,}/).map((paragraph) => paragraph.trim()),
    ).filter(Boolean);
    const sections: Omit<ParsedSection, 'order'>[] = [];
    let current: string[] = [];
    let currentLength = 0;

    const flush = () => {
      if (current.length === 0) return;
      sections.push({
        title: `第 ${sections.length + 1} 节`,
        content: normalizeBookText(current.join('\n\n')),
      });
      current = [];
      currentLength = 0;
    };

    for (const paragraph of paragraphs) {
      if (
        current.length > 0 &&
        currentLength + paragraph.length > this.fallbackSectionChars
      ) {
        flush();
      }
      current.push(paragraph);
      currentLength += paragraph.length;
    }
    flush();

    return sections;
  }

  private breakLongParagraphs(paragraphs: string[]): string[] {
    const result: string[] = [];
    for (const paragraph of paragraphs) {
      if (paragraph.length <= this.fallbackSectionChars) {
        result.push(paragraph);
        continue;
      }
      for (
        let offset = 0;
        offset < paragraph.length;
        offset += this.fallbackSectionChars
      ) {
        result.push(
          paragraph.slice(offset, offset + this.fallbackSectionChars),
        );
      }
    }
    return result;
  }

  private assertSectionLimit(sectionCount: number): void {
    if (sectionCount > this.maxSections) {
      throw new IngestionError(
        'SECTION_LIMIT_EXCEEDED',
        `小说分节数量不能超过 ${this.maxSections}`,
      );
    }
  }

  private hasUtf16Bom(buffer: Buffer): boolean {
    return (
      buffer.length >= 2 &&
      ((buffer[0] === 0xff && buffer[1] === 0xfe) ||
        (buffer[0] === 0xfe && buffer[1] === 0xff))
    );
  }
}
