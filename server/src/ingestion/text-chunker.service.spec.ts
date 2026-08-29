import { ConfigService } from '@nestjs/config';
import { TextChunkerService } from './text-chunker.service';

describe('TextChunkerService', () => {
  it('creates stable overlapping chunks with exact source offsets', () => {
    const content = '甲'.repeat(2_000);
    const service = createChunker(800, 120);

    const chunks = service.chunk(content);

    expect(chunks.map((chunk) => chunk.startOffset)).toEqual([0, 680, 1360]);
    expect(chunks.map((chunk) => chunk.endOffset)).toEqual([800, 1480, 2000]);
    for (const chunk of chunks) {
      expect(chunk.content).toBe(
        content.slice(chunk.startOffset, chunk.endOffset),
      );
      expect(chunk.content.length).toBeLessThanOrEqual(800);
    }
  });

  it('prefers paragraph and sentence boundaries near the target size', () => {
    const content = `${'甲'.repeat(70)}。\n\n${'乙'.repeat(70)}。`;
    const chunks = createChunker(100, 10).chunk(content);

    expect(chunks[0].content).toBe(`${'甲'.repeat(70)}。`);
    expect(chunks[1].content).toContain('乙'.repeat(60));
  });

  it('returns no chunks for whitespace-only content', () => {
    expect(createChunker(100, 10).chunk(' \n\n ')).toEqual([]);
  });

  it('rejects overlap greater than or equal to chunk size', () => {
    expect(() => createChunker(100, 100)).toThrow(
      'Book chunk overlap must be smaller than chunk size',
    );
  });

  function createChunker(size: number, overlap: number): TextChunkerService {
    return new TextChunkerService({
      get: jest.fn((key: string) =>
        key === 'books.chunkSize' ? size : overlap,
      ),
    } as unknown as ConfigService);
  }
});
