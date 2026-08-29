import { ConfigService } from '@nestjs/config';
import AdmZip from 'adm-zip';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { IngestionError } from '../errors/ingestion-error';
import { EpubBookParser } from './epub-book.parser';

describe('EpubBookParser', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'booksoul-epub-parser-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads metadata and spine-ordered chapters while removing active content', async () => {
    const filePath = await createEpub('normal.epub');

    const result = await createParser().parse({
      filePath,
      originalFileName: 'fallback.epub',
    });

    expect(result).toEqual(
      expect.objectContaining({
        title: '测试小说',
        author: '测试作者',
        language: 'zh',
      }),
    );
    expect(result.sections.map((section) => section.title)).toEqual([
      '第一章 初见',
      '第二章 重逢',
    ]);
    expect(result.sections.map((section) => section.order)).toEqual([1, 2]);
    expect(result.sections[0].content).toContain('第一章正文');
    expect(result.sections[0].content).not.toContain('恶意脚本');
    expect(result.sections[1].sourceRef).toContain('ch2.xhtml');
  });

  it('rejects archives with more entries than configured', async () => {
    const filePath = await createEpub('too-many.epub');

    await expect(
      createParser({ 'books.maxEpubEntries': 3 }).parse({
        filePath,
        originalFileName: 'too-many.epub',
      }),
    ).rejects.toMatchObject<Partial<IngestionError>>({
      code: 'UNSAFE_ARCHIVE',
    });
  });

  it('detects traversal names from the raw ZIP directory', async () => {
    const zip = buildEpubZip();
    zip.addFile('safe/evil00.txt', Buffer.from('x'));
    const unsafeBuffer = replaceAllAscii(
      zip.toBuffer(),
      'safe/evil00.txt',
      '../xxevil00.txt',
    );
    const filePath = path.join(root, 'unsafe.epub');
    await writeFile(filePath, unsafeBuffer);

    await expect(
      createParser().parse({
        filePath,
        originalFileName: 'unsafe.epub',
      }),
    ).rejects.toMatchObject<Partial<IngestionError>>({
      code: 'UNSAFE_ARCHIVE',
    });
  });

  it('rejects suspicious compression ratios before EPUB parsing', async () => {
    const zip = buildEpubZip();
    zip.addFile('OEBPS/bomb.txt', Buffer.alloc(2 * 1024 * 1024, 0x61));
    const filePath = path.join(root, 'bomb.epub');
    zip.writeZip(filePath);

    await expect(
      createParser({
        'books.maxEpubUncompressedBytes': 5 * 1024 * 1024,
      }).parse({ filePath, originalFileName: 'bomb.epub' }),
    ).rejects.toMatchObject<Partial<IngestionError>>({
      code: 'UNSAFE_ARCHIVE',
    });
  });

  it('returns INVALID_EPUB for a damaged archive', async () => {
    const filePath = path.join(root, 'damaged.epub');
    await writeFile(filePath, Buffer.from('not-a-zip'));

    await expect(
      createParser().parse({ filePath, originalFileName: 'damaged.epub' }),
    ).rejects.toMatchObject<Partial<IngestionError>>({ code: 'INVALID_EPUB' });
  });

  function createParser(values: Record<string, number> = {}): EpubBookParser {
    return new EpubBookParser({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);
  }

  async function createEpub(name: string): Promise<string> {
    const filePath = path.join(root, name);
    buildEpubZip().writeZip(filePath);
    return filePath;
  }

  function buildEpubZip(): AdmZip {
    const zip = new AdmZip();
    zip.addFile('mimetype', Buffer.from('application/epub+zip'));
    zip.addFile(
      'META-INF/container.xml',
      Buffer.from(`<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
        </container>`),
    );
    zip.addFile(
      'OEBPS/content.opf',
      Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
        <package version="2.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:identifier id="book-id">test-book</dc:identifier>
            <dc:title>测试小说</dc:title><dc:creator>测试作者</dc:creator><dc:language>zh</dc:language>
          </metadata>
          <manifest>
            <item id="title1" href="title1.xhtml" media-type="application/xhtml+xml"/>
            <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
            <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine><itemref idref="title1"/><itemref idref="ch1"/><itemref idref="ch2"/></spine>
        </package>`),
    );
    zip.addFile(
      'OEBPS/title1.xhtml',
      Buffer.from('<html><body><h1>第一章 初见</h1></body></html>'),
    );
    zip.addFile(
      'OEBPS/ch1.xhtml',
      Buffer.from(
        '<html><body><p>第一章正文。</p><script>恶意脚本</script></body></html>',
      ),
    );
    zip.addFile(
      'OEBPS/ch2.xhtml',
      Buffer.from(
        '<html><body><h1>第二章 重逢</h1><p>第二章正文。</p></body></html>',
      ),
    );
    return zip;
  }

  function replaceAllAscii(
    source: Buffer,
    search: string,
    replacement: string,
  ): Buffer {
    if (Buffer.byteLength(search) !== Buffer.byteLength(replacement)) {
      throw new Error('ZIP fixture replacement must keep filename length');
    }
    const result = Buffer.from(source);
    const searchBytes = Buffer.from(search);
    const replacementBytes = Buffer.from(replacement);
    let offset = 0;
    let replacements = 0;
    while ((offset = result.indexOf(searchBytes, offset)) >= 0) {
      replacementBytes.copy(result, offset);
      offset += replacementBytes.length;
      replacements += 1;
    }
    if (replacements < 2) {
      throw new Error('ZIP fixture filename was not present in both headers');
    }
    return result;
  }
});
