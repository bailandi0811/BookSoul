import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AdmZip from 'adm-zip';
import EPub from 'epub2';
import { convert } from 'html-to-text';
import { IngestionError } from '../errors/ingestion-error';
import { normalizeBookText, titleFromFileName } from '../text-normalization';
import type {
  BookParseSource,
  ParsedBook,
  ParsedSection,
} from '../types/parsed-book';
import type { BookParser } from './book-parser.interface';

const MAX_COMPRESSION_RATIO = 500;
const COMPRESSION_RATIO_MIN_BYTES = 1024 * 1024;

@Injectable()
export class EpubBookParser implements BookParser {
  private readonly maxEntries: number;
  private readonly maxUncompressedBytes: number;
  private readonly maxSections: number;

  constructor(configService: ConfigService) {
    this.maxEntries =
      configService.get<number>('books.maxEpubEntries') || 5_000;
    this.maxUncompressedBytes =
      configService.get<number>('books.maxEpubUncompressedBytes') ||
      100 * 1024 * 1024;
    this.maxSections = configService.get<number>('books.maxSections') || 5_000;
  }

  async parse(source: BookParseSource): Promise<ParsedBook> {
    this.validateArchive(source.filePath);

    let epub: EPub;
    try {
      epub = await EPub.createAsync(source.filePath);
    } catch (error) {
      throw new IngestionError('INVALID_EPUB', 'EPUB 文件结构无效', {
        cause: error,
      });
    }

    const sections: ParsedSection[] = [];
    let pendingHeading: Omit<ParsedSection, 'order'> | null = null;
    const pushSection = (section: Omit<ParsedSection, 'order'>) => {
      sections.push({ ...section, order: sections.length + 1 });
      if (sections.length > this.maxSections) {
        throw new IngestionError(
          'SECTION_LIMIT_EXCEEDED',
          `小说分节数量不能超过 ${this.maxSections}`,
        );
      }
    };

    for (const item of epub.flow) {
      if (!item.id) {
        throw new IngestionError('INVALID_EPUB', 'EPUB 正文章节标识缺失');
      }
      let html: string;
      try {
        html = await epub.getChapterAsync(item.id);
      } catch (error) {
        throw new IngestionError('INVALID_EPUB', 'EPUB 正文章节无法读取', {
          cause: error,
        });
      }

      const content = this.htmlToPlainText(html);
      if (!content) continue;

      const candidate = {
        title: this.sectionTitle(item.title, html, sections.length + 1),
        content,
        sourceRef: this.cleanLabel(item.href || item.id, 500),
      };
      if (this.isHeadingOnly(candidate.title, candidate.content)) {
        if (pendingHeading) pushSection(pendingHeading);
        pendingHeading = candidate;
        continue;
      }

      pushSection({
        ...candidate,
        title: pendingHeading?.title || candidate.title,
      });
      pendingHeading = null;
    }
    if (pendingHeading) pushSection(pendingHeading);

    if (sections.length === 0) {
      throw new IngestionError('EMPTY_CONTENT', 'EPUB 中没有可读取的正文');
    }

    const metadata = epub.metadata as Record<string, unknown>;
    return {
      title:
        this.cleanLabel(metadata.title, 200) ||
        titleFromFileName(source.originalFileName),
      ...(this.cleanLabel(metadata.creator, 200)
        ? { author: this.cleanLabel(metadata.creator, 200) }
        : {}),
      ...(this.cleanLabel(metadata.language, 50)
        ? { language: this.cleanLabel(metadata.language, 50) }
        : {}),
      sections,
    };
  }

  private validateArchive(filePath: string): void {
    let zip: AdmZip;
    try {
      zip = new AdmZip(filePath);
    } catch (error) {
      throw new IngestionError('INVALID_EPUB', 'EPUB 压缩包无法读取', {
        cause: error,
      });
    }

    const entries = zip.getEntries();
    if (entries.length === 0) {
      throw new IngestionError('INVALID_EPUB', 'EPUB 压缩包为空');
    }
    if (entries.length > this.maxEntries) {
      throw new IngestionError(
        'UNSAFE_ARCHIVE',
        `EPUB 文件条目不能超过 ${this.maxEntries}`,
      );
    }

    let totalUncompressedBytes = 0;
    for (const entry of entries) {
      const rawName = entry.rawEntryName?.toString('utf8') || entry.entryName;
      if (this.isUnsafeEntryName(rawName)) {
        throw new IngestionError('UNSAFE_ARCHIVE', 'EPUB 包含不安全路径');
      }

      const size = Number(entry.header.size);
      const compressedSize = Number(entry.header.compressedSize);
      if (
        !Number.isSafeInteger(size) ||
        size < 0 ||
        !Number.isSafeInteger(compressedSize) ||
        compressedSize < 0
      ) {
        throw new IngestionError('UNSAFE_ARCHIVE', 'EPUB 条目大小无效');
      }
      totalUncompressedBytes += size;
      if (totalUncompressedBytes > this.maxUncompressedBytes) {
        throw new IngestionError(
          'UNSAFE_ARCHIVE',
          'EPUB 解压后的内容超过安全限制',
        );
      }
      if (
        !entry.isDirectory &&
        size >= COMPRESSION_RATIO_MIN_BYTES &&
        compressedSize > 0 &&
        size / compressedSize > MAX_COMPRESSION_RATIO
      ) {
        throw new IngestionError('UNSAFE_ARCHIVE', 'EPUB 包含异常压缩内容');
      }
    }

    const mimeEntry = zip.getEntry('mimetype');
    if (!mimeEntry || mimeEntry.header.size > 128) {
      throw new IngestionError('INVALID_EPUB', 'EPUB 缺少有效 mimetype');
    }
    let mimeType: string;
    try {
      mimeType = mimeEntry.getData().toString('utf8').trim();
    } catch (error) {
      throw new IngestionError('INVALID_EPUB', 'EPUB mimetype 无法读取', {
        cause: error,
      });
    }
    if (mimeType !== 'application/epub+zip') {
      throw new IngestionError('INVALID_EPUB', 'EPUB mimetype 无效');
    }
  }

  private isUnsafeEntryName(value: string): boolean {
    const normalized = value.replace(/\\/g, '/');
    return (
      normalized.startsWith('/') ||
      /^[A-Za-z]:\//.test(normalized) ||
      normalized.split('/').some((segment) => segment === '..')
    );
  }

  private htmlToPlainText(html: string): string {
    const text = convert(html, {
      wordwrap: false,
      selectors: [
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'iframe', format: 'skip' },
        { selector: 'noscript', format: 'skip' },
        { selector: 'svg', format: 'skip' },
        { selector: 'img', format: 'skip' },
      ],
    }) as string;
    return normalizeBookText(text);
  }

  private isHeadingOnly(title: string, content: string): boolean {
    if (content.length > 200 || content.split('\n').length > 4) return false;
    const compactTitle = title.replace(/[\s\u3000]/g, '');
    const compactContent = content.replace(/[\s\u3000]/g, '');
    return compactTitle.length > 0 && compactContent === compactTitle;
  }

  private sectionTitle(
    flowTitle: unknown,
    html: string,
    fallbackOrder: number,
  ): string {
    const title = this.cleanLabel(flowTitle, 200);
    if (title) return title;

    const heading = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
    const headingText = heading
      ? this.cleanLabel(this.htmlToPlainText(heading), 200)
      : '';
    return headingText || `第 ${fallbackOrder} 节`;
  }

  private cleanLabel(value: unknown, maxLength: number): string {
    if (value === undefined || value === null) return '';
    const scalar = Array.isArray(value) ? value[0] : value;
    const text = convert(String(scalar), {
      wordwrap: false,
      selectors: [
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
      ],
    }) as string;
    return normalizeBookText(text).slice(0, maxLength);
  }
}
