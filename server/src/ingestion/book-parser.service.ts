import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { IngestionError } from './errors/ingestion-error';
import { EpubBookParser } from './parsers/epub-book.parser';
import { TxtBookParser } from './parsers/txt-book.parser';
import type { BookParseSource, ParsedBook } from './types/parsed-book';

@Injectable()
export class BookParserService {
  constructor(
    private readonly txtParser: TxtBookParser,
    private readonly epubParser: EpubBookParser,
  ) {}

  parse(source: BookParseSource): Promise<ParsedBook> {
    const extension = path.extname(source.originalFileName).toLowerCase();
    if (extension === '.txt') return this.txtParser.parse(source);
    if (extension === '.epub') return this.epubParser.parse(source);
    throw new IngestionError(
      'UNSUPPORTED_FORMAT',
      '目前只支持 EPUB 和 TXT 文件',
    );
  }
}
