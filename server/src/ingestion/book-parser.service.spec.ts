import { IngestionError } from './errors/ingestion-error';
import { BookParserService } from './book-parser.service';
import { EpubBookParser } from './parsers/epub-book.parser';
import { TxtBookParser } from './parsers/txt-book.parser';

describe('BookParserService', () => {
  const parsed = { title: 'Book', sections: [] };
  let txtParser: { parse: jest.Mock };
  let epubParser: { parse: jest.Mock };
  let service: BookParserService;

  beforeEach(() => {
    txtParser = { parse: jest.fn().mockResolvedValue(parsed) };
    epubParser = { parse: jest.fn().mockResolvedValue(parsed) };
    service = new BookParserService(
      txtParser as unknown as TxtBookParser,
      epubParser as unknown as EpubBookParser,
    );
  });

  it('routes TXT and EPUB files to their format parser', async () => {
    const txt = { filePath: 'source', originalFileName: 'BOOK.TXT' };
    const epub = { filePath: 'source', originalFileName: 'book.epub' };

    await service.parse(txt);
    await service.parse(epub);

    expect(txtParser.parse).toHaveBeenCalledWith(txt);
    expect(epubParser.parse).toHaveBeenCalledWith(epub);
  });

  it('rejects unsupported extensions with a stable error code', () => {
    const parse = () =>
      service.parse({ filePath: 'source', originalFileName: 'book.pdf' });

    expect(parse).toThrow(IngestionError);
    expect(parse).toThrow('目前只支持 EPUB 和 TXT 文件');
  });
});
